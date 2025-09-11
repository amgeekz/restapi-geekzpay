require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { URLSearchParams } = require('url');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { makeDynamic } = require('./src/qris');
const { parseAmountFromAnything } = require('./src/utils');
const fs = require('fs');

const app = express();

const EVENTS = []
function pushEvent(ev) {
  EVENTS.push(ev)
  if (EVENTS.length > 1000) EVENTS.shift()
}

// --- raw body capture ---
app.use((req, res, next) => {
  let data = '';
  let size = 0;
  const maxSize = 1024 * 1024;
  req.setEncoding('utf8');
  req.on('data', chunk => {
    size += Buffer.byteLength(chunk, 'utf8');
    if (size > maxSize) return res.status(413).json({ error: 'Request entity too large' });
    data += chunk;
  });
  req.on('end', () => {
    if (res.headersSent) return;
    req.rawBody = data || '';
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
          try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
        }
      } else {
        req.body = {};
      }
    } catch { req.body = {}; }
    next();
  });
});

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// --- diag ---
app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    hasQRIS: !!process.env.QRIS_STATIC,
    uniqueCode: Number(process.env.UNIQUE_CODE || 338),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
});

// --- qris dynamic ---
app.post('/qris/dynamic', async (req, res) => {
  try {
    const payloadStatic = (req.body.payload_static || process.env.QRIS_STATIC || '').trim();
    if (!payloadStatic) return res.status(400).json({ error: 'QRIS_STATIC not set and payload_static missing' });

    const hasBase = req.body.base_amount !== undefined && req.body.base_amount !== null && req.body.base_amount !== '';
    const hasAmount = req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '';

    if (!hasBase && !hasAmount) return res.status(422).json({ error: 'Provide either base_amount + unique_code, or amount' });

    let baseAmount = null;
    let uniq = null;
    let directAmount = null;

    if (hasBase) {
      baseAmount = parseInt(req.body.base_amount, 10);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) return res.status(422).json({ error: 'Invalid base_amount' });
      if (req.body.unique_code === undefined || req.body.unique_code === null || req.body.unique_code === '') {
        return res.status(422).json({ error: 'unique_code is required when using base_amount' });
      }
      uniq = parseInt(req.body.unique_code, 10);
      if (!Number.isFinite(uniq) || uniq < 0 || uniq > 999) return res.status(422).json({ error: 'unique_code must be 0..999' });
    }

    if (hasAmount) {
      directAmount = parseInt(req.body.amount, 10);
      if (!Number.isFinite(directAmount) || directAmount <= 0) return res.status(422).json({ error: 'Invalid amount' });
    }

    const total = hasAmount ? directAmount : (baseAmount + uniq);
    if (!Number.isFinite(total) || total <= 0) return res.status(422).json({ error: 'Invalid total amount' });

    const dynamicPayload = makeDynamic(payloadStatic, total);
    const response = {
      base_amount: hasBase ? baseAmount : null,
      unique_code: hasBase ? uniq : null,
      total,
      payload: dynamicPayload
    };

    const wantsQR = String(req.body.qr || '').toLowerCase();
    if (wantsQR === 'png' || wantsQR === 'true' || wantsQR === '1') {
      response.qr_png_data_url = await QRCode.toDataURL(dynamicPayload, { width: 480, margin: 2 });
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
});

app.all('/webhook/dana', async (req, res) => {
  try {
    const expected = String(process.env.WEBHOOK_TOKEN || '').trim()
    const provided = String(
      req.headers['x-webhook-token'] ||
      req.query.token ||
      (req.body && req.body.token) ||
      ''
    )
    if (expected && provided !== expected) {
      return res.status(401).json({ error: 'Bad token' })
    }

    const ip = (
      req.headers['x-vercel-forwarded-for'] ||
      req.headers['x-forwarded-for'] ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      ''
    ).toString().split(',')[0].trim().replace(/^::ffff:/, '') || '0.0.0.0'

    const method = req.method
    const headers = req.headers
    const body = req.body || {}
    const raw = req.rawBody || ''
    const amount = parseAmountFromAnything(body, raw)
    const bucket = Math.floor(Date.now() / 10000)
    const eventId = crypto.createHash('sha1').update(raw + '|' + bucket).digest('hex')

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
    }

    pushEvent(payload)
    try {
      const path = process.env.VERCEL ? '/tmp/events.log' : './data/events.log'
      if (!process.env.VERCEL) fs.mkdirSync('./data', { recursive: true })
      fs.appendFileSync(path, JSON.stringify(payload) + '\n')
    } catch {}

    return res.json(payload)
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) })
  }
})

app.get('/webhook/recent', (req, res) => {
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)))
  const out = EVENTS.slice(-limit).reverse()
  res.json({ ok: true, count: out.length, events: out })
})

app.use((req, res) => res.status(404).json({ error: 'Not found' }))

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000)
  app.listen(PORT, () => console.log(`Listening on ${PORT}`))
} else {
  module.exports = app
}