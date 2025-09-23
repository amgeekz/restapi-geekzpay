require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { URLSearchParams } = require('url');
const crypto = require('crypto');
const fs = require('fs');
const QRCode = require('qrcode');
const path = require('path');

const { makeDynamic } = require('./src/qris');
const { parseAmountFromAnything } = require('./src/utils');
const { redisLPushTrimExpire, redisLRangeJSON } = require('./src/redis');

const app = express();

const EVENT_TTL_SEC = Math.max(1, parseInt(process.env.EVENT_TTL_SEC || '30', 10));
const EVENT_MAX_KEEP = Math.max(1, parseInt(process.env.EVENT_MAX_KEEP || '5', 10));

function extractToken(req) {
  return (
    req.headers['x-webhook-token'] ||
    req.query.token ||
    (req.body && req.body.token) ||
    ''
  );
}

app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 },
  abortOnLimit: true
}));

app.use((req, res, next) => {
  const chunks = [];
  let size = 0;
  const maxSize = 1024 * 1024;
  
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    req.rawBody = '';
    req.body = req.body || {};
    return next();
  }
  
  req.on('data', chunk => {
    size += chunk.length;
    if (size > maxSize) {
      res.status(413).json({ error: 'Request entity too large' });
      return req.destroy();
    }
    chunks.push(chunk);
  });
  
  req.on('end', () => {
    if (res.headersSent) return;
    
    req.rawBodyBuffer = Buffer.concat(chunks);
    req.rawBody = req.rawBodyBuffer.toString('utf8');
    
    const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (ct === 'application/json') {
          req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
        } else if (ct === 'application/x-www-form-urlencoded') {
          const params = new URLSearchParams(req.rawBody);
          const obj = {}; for (const [k, v] of params) obj[k] = v;
          req.body = obj;
        } else if (ct === 'text/plain') {
          req.body = { message: req.rawBody, text: req.rawBody };
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

app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    hasQRIS: !!process.env.QRIS_STATIC,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
});

app.post('/qris/dynamic', async (req, res) => {
  try {
    const payloadStatic = (req.body.payload_static || process.env.QRIS_STATIC || '').trim();
    if (!payloadStatic) return res.status(400).json({ error: 'QRIS_STATIC not set and payload_static missing' });

    const hasBase = req.body.base_amount !== undefined && req.body.base_amount !== null && req.body.base_amount !== '';
    const hasAmount = req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '';
    if (!hasBase && !hasAmount) return res.status(422).json({ error: 'Provide either base_amount + unique_code, or amount' });

    let baseAmount = null, uniq = null, directAmount = null;
    if (hasBase) {
      baseAmount = parseInt(req.body.base_amount, 10);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) return res.status(422).json({ error: 'Invalid base_amount' });
      if (req.body.unique_code === undefined || req.body.unique_code === null || req.body.unique_code === '') {
        return res.status(422).json({ error: 'unique_code is required when using base_amount' });
      }
      uniq = parseInt(req.body.unique_code, 10);
      if (!Number.isFinite(uniq) || uniq < 1 || uniq > 999) return res.status(422).json({ error: 'unique_code must be 1..999' });
    }
    if (hasAmount) {
      directAmount = parseInt(req.body.amount, 10);
      if (!Number.isFinite(directAmount) || directAmount <= 0) return res.status(422).json({ error: 'Invalid amount' });
    }

    const total = hasAmount ? directAmount : (baseAmount + uniq);
    const dynamicPayload = makeDynamic(payloadStatic, total);

    const response = { base_amount: hasBase ? baseAmount : null, unique_code: hasBase ? uniq : null, total, payload: dynamicPayload };
    const wantsQR = String(req.body.qr || '').toLowerCase();
    if (wantsQR === 'png' || wantsQR === 'true' || wantsQR === '1') {
      response.qr_png_data_url = await QRCode.toDataURL(dynamicPayload, { width: 480, margin: 2 });
    }
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
});

app.post('/qris/decode', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        ok: false, 
        error: 'File gambar diperlukan' 
      });
    }

    const imageFile = req.files.image;    
    if (!imageFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ 
        ok: false, 
        error: 'File harus berupa gambar (PNG, JPG, JPEG)' 
      });
    }

    if (imageFile.size > 2 * 1024 * 1024) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Ukuran file maksimal 2MB' 
      });
    }
    
    console.log('QR decode attempt:', imageFile.name, imageFile.size);

    try {
      const payload = await QRCode.decode(imageFile.data);
      
      if (payload) {
        return res.json({ 
          ok: true, 
          payload: payload,
          file_info: {
            name: imageFile.name,
            type: imageFile.mimetype,
            size: imageFile.size
          },
          decoded_at: new Date().toISOString()
        });
      }
    } catch (decodeError) {
      console.log('QRCode.decode error:', decodeError.message);
    }

    return res.status(400).json({ 
      ok: false, 
      error: 'Tidak dapat membaca QR code',
      note: 'Pastikan gambar jelas dan format QR code valid'
    });

  } catch (error) {
    console.error('QR decode endpoint error:', error);
    
    res.status(500).json({ 
      ok: false, 
      error: 'Terjadi kesalahan internal',
      detail: error.message
    });
  }
});

function toCompact(ev, debug = false) {
  const base = {
    ok: true,
    token: ev.token,
    event_id: ev.event_id,
    received_at: ev.received_at,
    amount: ev.amount,
    method: ev.method,
    ip: ev.ip
  };
  if (debug) {
    base.debug = { body: ev.body, query: ev.query, headers: ev.headers };
  } else if (ev.body && (ev.body.message || ev.body.text || ev.body.amount || ev.body.total || ev.body.order_id || ev.body.status)) {
    base.body = {};
    if (ev.body.message) base.body.message = ev.body.message;
    if (ev.body.text) base.body.text = ev.body.text;
    if (ev.body.amount) base.body.amount = ev.body.amount;
    if (ev.body.total) base.body.total = ev.body.total;
    if (ev.body.order_id) base.body.order_id = ev.body.order_id;
    if (ev.body.status) base.body.status = ev.body.status;
  }
  return base;
}

app.all('/webhook/payment', async (req, res) => {
  try {
    const expected = String(process.env.WEBHOOK_TOKEN || '').trim();
    const provided = String(extractToken(req));
    if (expected) {
      if (provided !== expected) return res.status(401).json({ error: 'Bad token' });
    } else {
      if (!provided) return res.status(401).json({ error: 'Token required (X-Webhook-Token / ?token= / body.token)' });
    }

    const tokenForBucket = provided;
    const ip = (req.headers['x-forwarded-for'] ||
                req.headers['cf-connecting-ip'] ||
                req.headers['x-real-ip'] ||
                req.socket?.remoteAddress ||
                ''
               ).toString().split(',')[0].trim().replace(/^::ffff:/, '') || '0.0.0.0';

    const method = req.method;
    const headers = req.headers;
    const body = req.body || {};
    const raw = req.rawBody || '';
    const amount = parseAmountFromAnything(body, raw);

    const bucket = Math.floor(Date.now() / 10000);
    const eventId = crypto.createHash('sha1').update((raw || JSON.stringify(body)) + '|' + bucket).digest('hex');

    const eventPayload = {
      ok: true,
      token: tokenForBucket,
      event_id: eventId,
      received_at: new Date().toISOString(),
      method,
      ip,
      amount,
      body,
      query: req.query || {},
      headers
    };

    const key = `ev:${tokenForBucket}`;
    await redisLPushTrimExpire(key, JSON.stringify(eventPayload), EVENT_MAX_KEEP, EVENT_TTL_SEC);

    try {
      const p = process.env.VERCEL ? '/tmp/events.log' : './data/events.log';
      if (!process.env.VERCEL) fs.mkdirSync('./data', { recursive: true });
      fs.appendFileSync(p, JSON.stringify(eventPayload) + '\n');
    } catch {}

    const debug = String(req.query.debug || '0') === '1';
    return res.json(toCompact(eventPayload, debug));
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
});

app.get('/webhook/recent', async (req, res) => {
  const token = String(
    req.headers['x-webhook-token'] || req.query.token || (req.body && req.body.token) || ''
  );
  if (!token) return res.status(401).json({ error: 'Token required' });

  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
  const key = `ev:${token}`;

  const rowsRaw = await redisLRangeJSON(key, 0, limit - 1);
  const rows = (rowsRaw || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));

  const events = rows.map(ev => ({
    ok: true,
    token: ev.token,
    event_id: ev.event_id,
    received_at: ev.received_at,
    amount: ev.amount,
    method: ev.method,
    ip: ev.ip,
    body: ev.body && (ev.body.message || ev.body.text || ev.body.amount || ev.body.total || ev.body.order_id || ev.body.status)
      ? (() => {
          const b = {};
          if (ev.body.message) b.message = ev.body.message;
          if (ev.body.text) b.text = ev.body.text;
          if (ev.body.amount) b.amount = ev.body.amount;
          if (ev.body.total) b.total = ev.body.total;
          if (ev.body.order_id) b.order_id = ev.body.order_id;
          if (ev.body.status) b.status = ev.body.status;
          return b;
        })()
      : undefined
  }));

  res.json({ ok: true, token, count: events.length, events });
});

app.get('/webhook/summary', async (req, res) => {
  const token = String(
    req.headers['x-webhook-token'] || req.query.token || (req.body && req.body.token) || ''
  );
  if (!token) return res.status(401).json({ error: 'Token required' });

  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));
  const key = `ev:${token}`;

  const rowsRaw = await redisLRangeJSON(key, 0, limit - 1);
  const rows = (rowsRaw || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));

  const events = rows.map(e => ({
    id: e.event_id,
    time: e.received_at,
    amount: e.amount,
    ip: e.ip,
    method: e.method,
    order_id: e.body?.order_id,
    status: e.body?.status
  }));

  res.json({ ok: true, token, count: events.length, events });
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600')
}));

app.get(['/', '/docs'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => console.log(`QRIS REST API listening on http://${HOST}:${PORT}`));
} else {
  module.exports = app;
}