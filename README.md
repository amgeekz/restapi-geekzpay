# QRIS REST API (Static → Dynamic) + DANA Webhook

Simple, cPanel‑friendly Node.js REST API that provides:

- `POST /qris/dynamic` — Convert **QRIS static** payload to **dynamic** (inject tag 54 amount + CRC tag 63)
- `ANY  /webhook/dana` — Forwarder‑friendly webhook receiver (JSON / form / text), token + IP allowlist

## 1) Install

```bash
npm i
cp .env.example .env
# edit .env
```

Run locally:
```bash
node server.js
# or
npm start
```

## 2) Configure

`.env`:
```ini
QRIS_STATIC=00020101021126...6304ABCD
UNIQUE_CODE=338
WEBHOOK_TOKEN=changeme
ALLOWED_IPS=         # optional allowlist, e.g. 1.2.3.4,5.6.7.8
PORT=3000
```

## 3) API

### POST /qris/dynamic

Body (JSON or form):
- `base_amount` (int) **and** `unique_code` (int, chosen by the user) **OR**
- `amount` (int) total directly
- `payload_static` (string) optional override for `.env` QRIS_STATIC
- `qr` (string) set to `png` to include `qr_png_data_url` in response

Example:
```bash
curl -X POST http://localhost:3000/qris/dynamic   -d base_amount=10000 -d unique_code=338 -d qr=png
```

Response:
```json
{
  "base_amount": 10000,
  "unique_code": 338,
  "total": 10338,
  "payload": "000201...540610338.006304ABCD",
  "qr_png_data_url": "data:image/png;base64,iVBOR..."
}
```

### ANY /webhook/dana

Accepts GET/POST with JSON, form or plain text. Use a **token**:

```bash
curl -X POST http://localhost:3000/webhook/dana?token=changeme   -H 'Content-Type: application/json'   -d '{ "message": "Pembayaran masuk Rp 10.338 dari DANA #INV001" }'
```

Response (example):
```json
{
  "ok": true,
  "event_id": "f2c9...",
  "received_at": "2025-09-11T00:00:00.000Z",
  "method": "POST",
  "ip": "127.0.0.1",
  "amount": 10338,
  "body": { "message": "..." },
  "query": { "token": "changeme" },
  "headers": { ... }
}
```

It also appends a line per event to `./data/events.log`.

> Matching this to your own invoice system is straightforward: create an invoice for total (e.g., 10,338), then when webhook reports `amount=10338`, mark that invoice paid and credit `base_amount` only.

## 4) Deploy on cPanel (Node.js App / Passenger)

1. Upload this folder to your hosting (e.g., `~/api.amgeekz.com/`).
2. In cPanel → **Setup Node.js App**:
   - App Directory: the folder you uploaded
   - Application Startup File: `server.js`
   - Node.js version: 18–22
3. Click **Run NPM Install** (or run `npm i` via Terminal).
4. Set **Environment variables** accordingly (from `.env`).
5. Start the app.

Optional `.htaccess` (if needed by your host/passenger):
```apache
# CloudLinux Passenger Example (adjust paths)
PassengerAppRoot "/home/USER/api.amgeekz.com"
PassengerBaseURI "/"
PassengerNodejs "/home/USER/nodevenv/api.amgeekz.com/22/bin/node"
PassengerAppType node
PassengerStartupFile server.js
```

## 5) Notes

- Keep your QRIS static payload **PRIVATE**.
- The TLV/CRC logic adheres to EMVCo QR MPM conventions for tag 54 (amount) and tag 63 (CRC16‑CCITT).
- For **fully automatic top‑up**, connect this webhook to a gateway/issuer that can forward payment notifications (or implement a legal, reliable statement/mutation fetcher).
