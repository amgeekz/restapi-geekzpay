require('dotenv').config();
const express = require('express');
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

const app = express();

/* ================================
 *  In-memory store per TOKEN
 * ================================ */
const EVENTS_BY_TOKEN = new Map(); // token -> events[]

function pushEvent(token, ev) {
  const key = String(token || 'default');
  if (!EVENTS_BY_TOKEN.has(key)) EVENTS_BY_TOKEN.set(key, []);
  const arr = EVENTS_BY_TOKEN.get(key);
  arr.push(ev);
  if (arr.length > 1000) arr.shift();
}

function extractToken(req) {
  return (
    req.headers['x-webhook-token'] ||
    req.query.token ||
    (req.body && req.body.token) ||
    ''
  );
}

/* ================================
 *  RAW BODY (kebal serverless)
 * ================================ */
app.use((req, res, next) => {
  const hasBody = !['GET', 'HEAD'].includes(String(req.method || '').toUpperCase());
  if (!hasBody) { req.rawBody = ''; req.body = {}; return next(); }

  let chunks = [];
  let length = 0;
  const MAX = 1024 * 1024; // 1MB

  req.on('data', (c) => {
    try {
      if (!Buffer.isBuffer(c)) c = Buffer.from(String(c));
      length += c.length;
      if (length > MAX) {
        try { req.destroy(); } catch {}
        return res.status(413).json({ error: 'Request entity too large' });
      }
      chunks.push(c);
    } catch {
      // Jangan biarkan crash
    }
  });

  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      const raw = buf.toString('utf8');
      req.rawBody = raw;

      const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (ct === 'application/json') {
        try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      } else if (ct === 'application/x-www-form-urlencoded') {
        try {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params) obj[k] = v;
          req.body = obj;
        } catch { req.body = {}; }
      } else if (ct === 'text/plain') {
        req.body = { text: raw };
      } else {
        req.body = {};
      }
    } catch {
      req.rawBody = '';
      req.body = {};
    }
    next();
  });

  req.on('error', () => {
    req.rawBody = '';
    req.body = {};
    next();
  });
});

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

/* ================================
 *  Diagnostics
 * ================================ */
app.get('/diag', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    hasQRIS: !!process.env.QRIS_STATIC,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    tokens_cached: EVENTS_BY_TOKEN.size
  });
});

/* ================================
 *  QRIS Static -> Dynamic
 * ================================ */
app.post('/qris/dynamic', async (req, res) => {
  try {
    const payloadStatic = (req.body.payload_static || process.env.QRIS_STATIC || '').trim();
    if (!payloadStatic) return res.status(400).json({ error: 'QRIS_STATIC not set and payload_static missing' });

    const hasBase = req.body.base_amount !== undefined && req.body.base_amount !== null && req.body.base_amount !== '';
    const hasAmount = req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '';

    if (!hasBase && !hasAmount) {
      return res.status(422).json({ error: 'Provide either base_amount + unique_code, or amount' });
    }

    let baseAmount = null, uniq = null, directAmount = null;

    if (hasBase) {
      baseAmount = parseInt(req.body.base_amount, 10);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return res.status(422).json({ error: 'Invalid base_amount' });
      }
      if (req.body.unique_code === undefined || req.body.unique_code === null || req.body.unique_code === '') {
        return res.status(422).json({ error: 'unique_code is required when using base_amount' });
      }
      uniq = parseInt(req.body.unique_code, 10);
      if (!Number.isFinite(uniq) || uniq < 1 || uniq > 999) {
        return res.status(422).json({ error: 'unique_code must be 1..999' });
      }
    }

    if (hasAmount) {
      directAmount = parseInt(req.body.amount, 10);
      if (!Number.isFinite(directAmount) || directAmount <= 0) {
        return res.status(422).json({ error: 'Invalid amount' });
      }
    }

    const total = hasAmount ? directAmount : (baseAmount + uniq);
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

/* ================================
 *  Generic Payment Webhook (DANA/ShopeePay/GoPay/OVO/...)
 *  Route: /webhook/payment
 * ================================ */
app.all('/webhook/payment', async (req, res) => {
  try {
    const expected = String(process.env.WEBHOOK_TOKEN || '').trim();
    const provided = String(extractToken(req));

    if (expected ? (provided !== expected) : !provided) {
      return res.status(401).json({ error: expected ? 'Bad token' : 'Token required (X-Webhook-Token / ?token= / body.token)' });
    }

    // IP aman
    let ip = '0.0.0.0';
    try {
      ip = (
        req.headers['x-forwarded-for'] ||
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        (req.socket && req.socket.remoteAddress) ||
        ''
      ).toString().split(',')[0].trim().replace(/^::ffff:/, '') || '0.0.0.0';
    } catch {}

    const method = req.method;
    const headers = req.headers || {};
    const body = req.body || {};
    const raw = typeof req.rawBody === 'string' ? req.rawBody : '';

    let amount = null;
    try { amount = parseAmountFromAnything(body, raw); } catch { amount = null; }

    const bucket = Math.floor(Date.now() / 10000);
    const baseForHash = raw && raw.length ? raw : JSON.stringify(body || {});
    const eventId = crypto.createHash('sha1').update(baseForHash + '|' + bucket).digest('hex');

    const payload = {
      ok: true,
      token: provided,
      event_id: eventId,
      received_at: new Date().toISOString(),
      method,
      ip,
      amount,
      body,
      query: req.query || {},
      headers
    };

    pushEvent(provided, payload);

    try {
      const p = process.env.VERCEL ? '/tmp/events.log' : './data/events.log';
      if (!process.env.VERCEL) fs.mkdirSync('./data', { recursive: true });
      fs.appendFileSync(p, JSON.stringify(payload) + '\n');
    } catch {}

    return res.json(payload);
  } catch (err) {
    // Jangan biarkan crash jadi FUNCTION_INVOCATION_FAILED
    return res.status(200).json({ ok: false, error: String(err && err.message || err || 'unknown') });
  }
});

/* ================================
 *  Recent & Summary — per token
 * ================================ */
app.get('/webhook/recent', (req, res) => {
  const token = String(extractToken(req));
  if (!token) return res.status(401).json({ error: 'Token required' });

  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
  const arr = EVENTS_BY_TOKEN.get(token) || [];
  const out = arr.slice(-limit).reverse();
  res.json({ ok: true, token, count: out.length, events: out });
});

app.get('/webhook/summary', (req, res) => {
  const token = String(extractToken(req));
  if (!token) return res.status(401).json({ error: 'Token required' });

  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));
  const arr = EVENTS_BY_TOKEN.get(token) || [];
  const slice = arr.slice(-limit).reverse();
  const events = slice.map(e => ({
    id: e.event_id,
    time: e.received_at,
    amount: e.amount,
    order_id: e.body?.order_id,
    status: e.body?.status,
    ip: e.ip
  }));
  res.json({ ok: true, token, count: events.length, events });
});

/* ================================
 *  DEBUG (opsional)
 * ================================ */
app.all('/__echo', (req, res) => {
  res.json({
    ok: true,
    method: req.method,
    ct: req.headers['content-type'] || null,
    query: req.query || {},
    body: req.body || null,
    raw: (req.rawBody || '').slice(0, 512)
  });
});

app.get('/__routes', (req, res) => {
  const routes = [];
  try {
    app._router.stack.forEach((m) => {
      if (m.route?.path) {
        routes.push({ method: Object.keys(m.route.methods)[0]?.toUpperCase() || 'USE', path: m.route.path });
      } else if (m.name === 'router' && m.handle?.stack) {
        m.handle.stack.forEach((s) => {
          if (s.route?.path) {
            routes.push({ method: Object.keys(s.route.methods)[0]?.toUpperCase() || 'USE', path: s.route.path });
          }
        });
      }
    });
  } catch {}
  res.json({ ok: true, routes });
});

/* ================================
 *  Static & Docs
 * ================================ */
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// Route khusus / dan /docs -> docs.html
app.get(['/', '/docs'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================================ */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => console.log(`QRIS REST API listening on http://${HOST}:${PORT}`));
} else {
  module.exports = app;
}