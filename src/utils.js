function onlyDigits(str) {
  return (str || '').replace(/[^0-9]/g, '');
}

function normalizeRupiahFragment(s) {
  if (!s) return null;
  let t = String(s).trim();

  t = t.replace(/[^\d.,]/g, '');
  if (!t) return null;

  const hasDot = t.includes('.');
  const hasComma = t.includes(',');

  if (hasDot && hasComma) {
    // contoh: 25.000,00 -> 25000
    // contoh: 1,234.56 (jarang di ID) -> 1235 (dibulatkan)
    const lastSep = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    if (lastSep === ',' && /,\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, '').replace(',', '.');
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    if (lastSep === '.' && /\.\d{1,2}$/.test(t)) {
      t = t.replace(/,/g, '');
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    t = t.replace(/[.,]/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  if (hasComma) {
    if (/,?\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, '').replace(',', '.');
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    t = t.replace(/,/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  if (hasDot) {
    // di ID, titik hampir selalu pemisah ribuan
    t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseAmountLike(str) {
  if (!str) return null;
  const m = String(str).match(/(?:rp\.?|idr)?\s*([0-9][0-9.,]*)/i);
  if (!m) return null;
  return normalizeRupiahFragment(m[1]);
}

function parseAmountFromAnything(body, raw) {
  const candidates = [];
  const keys = ['amount', 'total', 'nominal', 'value', 'price'];
  for (const k of keys) if (body && body[k] != null) candidates.push(body[k]);

  const msgKeys = ['message', 'msg', 'text', 'note', 'description', 'desc', 'content', 'title', 'bigtext', 'subtext', 'infotext'];
  for (const k of msgKeys) if (body && body[k]) candidates.push(body[k]);

  if (raw) candidates.push(raw);

  for (const c of candidates) {
    const n = parseAmountLike(c);
    if (n != null) return n;
  }

  const merged = candidates.filter(Boolean).join(' ');
  const m = merged.match(/(?:rp|idr)\s*[:\-]?\s*([0-9][0-9.,]*)/i);
  if (m) {
    const n = normalizeRupiahFragment(m[1]);
    if (n != null) return n;
  }

  const anyNums = [...merged.matchAll(/([0-9][0-9.,]+)/g)].map(x => x[1]);
  let best = null;
  for (const frag of anyNums) {
    const v = normalizeRupiahFragment(frag);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

function ipAllowed(ip, allowListStr) {
  const list = (allowListStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(ip);
}

module.exports = { parseAmountFromAnything, ipAllowed };