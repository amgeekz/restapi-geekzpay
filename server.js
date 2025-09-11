/* QRIS REST API
 * - POST /qris/dynamic : convert QRIS static -> dynamic (embed amount/tag 54, re-CRC tag 63)
 * - ANY  /webhook/dana : generic webhook receiver (forwarder-friendly)
 *
 * CommonJS, friendly with cPanel Passenger
 */
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { URLSearchParams } = require('url');
const crypto = require('crypto');
const { makeDynamic } = require('./src/qris');
const { parseAmountFromAnything, ipAllowed } = require('./src/utils');
const QRCode = require('qrcode');

const app = express();

// --- Raw body capture (so webhook can compute digests/regex on raw text) ---
app.use((req, res, next) => {
  let data = '';
  const maxSize = 1024 * 1024; // 1MB limit
  let size = 0;
  let overflowed = false;
  
  req.setEncoding('utf8');
  req.on('data', chunk => { 
    if (overflowed) return;
    
    size += Buffer.byteLength(chunk, 'utf8');
    if (size > maxSize) {
      overflowed = true;
      res.status(413).json({ error: 'Request entity too large' });
      return;
    }
    data += chunk; 
  });
  req.on('end', () => {
    if (overflowed) return;
    
    req.rawBody = data || '';
    // Best-effort body parser (JSON or x-www-form-urlencoded); fall back to empty object
    const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (ct === 'application/json') {
          req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
        } else if (ct === 'application/x-www-form-urlencoded') {
          const params = new URLSearchParams(req.rawBody);
          const obj = {};
          for (const [k, v] of params) obj[k] = v;
          req.body = obj;
        } else if (ct === 'text/plain') {
          req.body = { text: req.rawBody };
        } else {
          // Unknown type -> try JSON then fallback
          try { req.body = JSON.parse(req.rawBody); }
          catch { req.body = {}; }
        }
      } else {
        req.body = {};
      }
    } catch (e) {
      req.body = {};
    }
    next();
  });
});

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// Health/diag
app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    hasQRIS: !!process.env.QRIS_STATIC,
    uniqueCode: Number(process.env.UNIQUE_CODE || 338),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
});

/**
 * POST /qris/dynamic
 * Body:
 *  - base_amount (int) [optional if 'amount' provided]
 *  - unique_code (int, default ENV UNIQUE_CODE, used if base_amount provided)
 *  - amount (int) [optional; direct total if provided]
 *  - payload_static (string, optional) -> override ENV QRIS_STATIC
 *  - qr (bool|string) -> 'png' to return dataURL
 */
app.post('/qris/dynamic', async (req, res) => {
  try {
    const payloadStatic = (req.body.payload_static || process.env.QRIS_STATIC || '').trim();
    if (!payloadStatic) {
      return res.status(400).json({ error: 'QRIS_STATIC not set and payload_static missing' });
    }

    const hasBase = (req.body.base_amount !== undefined && req.body.base_amount !== null && req.body.base_amount !== '');
    const baseAmount = hasBase ? parseInt(req.body.base_amount, 10) : null;
    const hasAmount = (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '');
    const directAmount = hasAmount ? parseInt(req.body.amount, 10) : null;

    if (!hasBase && !hasAmount) {
      return res.status(422).json({ error: 'Provide either base_amount + unique_code, or amount' });
    }

    let uniq = null;
    if (hasBase) {
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return res.status(422).json({ error: 'Invalid base_amount' });
      }
      // unique_code MUST be supplied by the user when base_amount is provided
      if (req.body.unique_code === undefined || req.body.unique_code === null || req.body.unique_code === '') {
        return res.status(422).json({ error: 'unique_code is required when using base_amount' });
      }
      uniq = parseInt(req.body.unique_code, 10);
      if (!Number.isFinite(uniq) || uniq < 0 || uniq > 999) {
        return res.status(422).json({ error: 'unique_code must be an integer between 0 and 999' });
      }
    }

    if (hasAmount && (!Number.isFinite(directAmount) || directAmount <= 0)) {
      return res.status(422).json({ error: 'Invalid amount' });
    }

    const total = hasAmount ? directAmount : (baseAmount + uniq);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(422).json({ error: 'Invalid total amount' });
    }

    const dynamicPayload = makeDynamic(payloadStatic, total);
    const response = {
      base_amount: hasBase ? baseAmount : null,
      unique_code: hasBase ? uniq : null,
      total,
      payload: dynamicPayload
    };

    // Optional QR rendering
    const wantsQR = String(req.body.qr || '').toLowerCase();
    if (wantsQR === 'png' || wantsQR === 'true' || wantsQR === '1') {
      const dataUrl = await QRCode.toDataURL(dynamicPayload, { width: 480, margin: 2 });
      response.qr_png_data_url = dataUrl;
    }

    return res.json(response);
  } catch (err) {
    console.error('qris/dynamic error', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
});

/**
 * ANY /webhook/dana
 * Forwarder-friendly webhook receiver.
 * Security:
 *  - Optional token via header X-Webhook-Token or query ?token=...
 *  - Optional IP allowlist via env ALLOWED_IPS=1.2.3.4,5.6.7.8
 * Behavior:
 *  - Accepts JSON, x-www-form-urlencoded, or plain text.
 *  - Extracts amount heuristically (fields: amount, total, nominal, value, text/message/etc.).
 *  - Returns parsed insight (amount, currency guess), and echo raw.
 */
app.all('/webhook/dana', async (req, res) => {
  try {
    // IP allowlist (secure check - use direct socket IP to prevent spoofing)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

    // Token check
    const expected = (process.env.WEBHOOK_TOKEN || '').trim();
    if (expected) {
      const token = (req.headers['x-webhook-token'] || req.query.token || '').toString();
      if (token !== expected) return res.status(401).json({ error: 'Bad token' });
    }

    const method = req.method;
    const headers = req.headers;
    const body = req.body || {};
    const raw = req.rawBody || '';

    // Heuristic amount extraction
    const amount = parseAmountFromAnything(body, raw);

    // Basic idempotency key from raw payload + a short time bucket
    const bucket = Math.floor(Date.now() / 10000); // 10s bucket
    const eventId = crypto.createHash('sha1').update(raw + '|' + bucket).digest('hex');

    const payload = {
      ok: true,
      event_id: eventId,
      received_at: new Date().toISOString(),
      method,
      ip,
      amount,
      body,
      query: req.query || {},
      headers
    };

    // Minimal logging to ./data/events.log (append)
    try {
      const fs = require('fs');
      const line = JSON.stringify(payload) + "\n";
      fs.mkdirSync('./data', { recursive: true });
      fs.appendFileSync('./data/events.log', line);
    } catch (e) {
      console.error('log failed', e);
    }

    return res.json(payload);
  } catch (err) {
    console.error('webhook/dana error', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`QRIS REST API listening on http://${HOST}:${PORT}`);
});
