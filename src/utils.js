function onlyDigits(str) {
  return (str || '').replace(/[^0-9]/g, '');
}

function parseAmountLike(str) {
  if (!str) return null;
  // Common Indonesian formats: 'Rp 10.338', '10,338', '10338'
  const m = String(str).match(/(?:rp\.?|idr)?\s*([0-9][0-9\.,]*)/i);
  if (!m) return null;
  const raw = m[1];
  const digits = raw.replace(/\D/g, '');
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function parseAmountFromAnything(body, raw) {
  // Try explicit fields first
  const candidates = [];
  const keys = ['amount', 'total', 'nominal', 'value', 'price'];
  for (const k of keys) {
    if (body && body[k] != null) candidates.push(body[k]);
  }
  // Try common message fields
  const msgKeys = ['message', 'msg', 'text', 'note', 'description', 'desc', 'content'];
  for (const k of msgKeys) {
    if (body && body[k]) candidates.push(body[k]);
  }
  // Include raw body as fallback
  if (raw) candidates.push(raw);

  for (const c of candidates) {
    const n = parseAmountLike(c);
    if (n) return n;
  }
  return null;
}

function ipAllowed(ip, allowListStr) {
  const list = (allowListStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  // crude match: exact string match (works for IPv4); you can expand to CIDR if needed
  return list.includes(ip);
}

module.exports = { parseAmountFromAnything, ipAllowed };
