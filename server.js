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
const sharp = require('sharp');
const { makeDynamic } = require('./src/qris');
const { parseAmountFromAnything } = require('./src/utils');
const { redisLPushTrimExpire, redisLRangeJSON } = require('./src/redis');

const app = express();
app.set('json spaces', 2);

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

function extractZXingText(html) {
  const rx1 = /<td>Raw text<\/td>\s*<td><pre>([\s\S]*?)<\/pre>/i;
  const rx2 = /<td>Parsed Result<\/td>\s*<td><pre>([\s\S]*?)<\/pre>/i;
  const m1 = html.match(rx1);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = html.match(rx2);
  if (m2 && m2[1]) return m2[1].trim();
  return '';
}

async function postToZXing(buf, filename, mime) {
  const fd = new FormData();
  fd.append('f', new File([buf], filename, { type: mime }));

  const r = await fetch('https://zxing.org/w/decode', {
    method: 'POST',
    body: fd
  });
  const text = await r.text();
  return { status: r.status, text };
}

app.use(fileUpload({
  limits: { fileSize: 8 * 1024 * 1024 },
  useTempFiles: false
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

app.all('/diag', (req, res) => {
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
      return res.status(400).json({ ok: false, error: 'File gambar diperlukan (field: image)' });
    }

    const f = req.files.image;
    const name = f.name || 'qr.jpg';
    const mime = f.mimetype || 'image/jpeg';
    const buf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);

    console.log('Decode: got file ->', name, mime, buf.length);

    let r1 = await postToZXing(buf, name, mime);
    console.log('ZXing attempt#1 status:', r1.status);

    let payload = '';
    if (r1.status === 200) {
      payload = extractZXingText(r1.text);
    }

    if (!payload) {
      console.log('ZXing attempt#1 failed/empty, try preprocessing with sharp');
      const png = await sharp(buf)
        .rotate()
        .grayscale()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer();

      let r2 = await postToZXing(png, (name.replace(/\.[^.]+$/, '') || 'qr') + '.png', 'image/png');
      console.log('ZXing attempt#2 status:', r2.status);
      if (r2.status === 200) {
        payload = extractZXingText(r2.text);
      }
    }

    if (!payload) {
      return res.status(422).json({ ok: false, error: 'QR tidak terbaca oleh ZXing' });
    }

    return res.json({
      ok: true,
      payload,
      file_info: { name, type: mime, size: buf.length },
      decoded_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Decode error:', err);
    return res.status(500).json({ ok: false, error: 'Internal error', detail: String(err.message || err) });
  }
});

function toCompact(ev, debug = false) {
  if (!ev || typeof ev !== 'object') {
    return { ok: true };
  }
  
  const base = {
    ok: true,
    token: ev.token || 'unknown',
    event_id: ev.event_id || 'unknown',
    received_at: ev.received_at || new Date().toISOString(),
    amount: ev.amount || 0,
    method: ev.method || 'UNKNOWN',
    ip: ev.ip || '0.0.0.0'
  };
  
  if (debug) {
    base.debug = { 
      body: ev.body || {}, 
      query: ev.query || {}, 
      headers: ev.headers || {} 
    };
  } else if (ev.body && typeof ev.body === 'object') {
    const b = {};
    if (ev.body.message) b.message = ev.body.message;
    if (ev.body.text) b.text = ev.body.text;
    if (ev.body.amount) b.amount = ev.body.amount;
    if (ev.body.total) b.total = ev.body.total;
    if (ev.body.order_id) b.order_id = ev.body.order_id;
    if (ev.body.status) b.status = ev.body.status;
    if (Object.keys(b).length > 0) base.body = b;
  }
  
  return base;
}

function safeParseMaybeString(v) {
  if (!v) return null;
  
  if (typeof v === 'object' && v !== null) {
    return v;
  }
  
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return { raw: v };
    }
  }
  
  return null;
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
    await redisLPushTrimExpire(key, eventPayload, EVENT_MAX_KEEP, EVENT_TTL_SEC);

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

app.get('/webhook/summary', async (req, res) => {
  try {
    const token = String(extractToken(req));
    if (!token) return res.status(401).json({ error: 'Token required' });

    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const key = `ev:${token}`;

    const rowsRaw = await redisLRangeJSON(key, 0, limit - 1);
    
    const rows = [];
    for (let i = 0; i < rowsRaw.length; i++) {
      const item = rowsRaw[i];
      const parsed = safeParseMaybeString(item);
      if (parsed && typeof parsed === 'object') {
        rows.push(parsed);
      }
    }
    
    const events = rows.map(ev => toCompact(ev, false));

    res.json({ ok: true, token, count: events.length, events });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
  }
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