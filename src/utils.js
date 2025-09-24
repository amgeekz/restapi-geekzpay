function onlyDigits(str) {
  return (str || '').replace(/[^0-9]/g, '');
}
function normalizeRupiahFragment(s) {
  if (!s) return null;
  let t = String(s).trim();
  t = t.replace(/[^\d.,]/g, "");
  if (!t) return null;

  const hasDot = t.includes(".");
  const hasComma = t.includes(",");

  if (hasDot && hasComma) {
    const lastSep = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    if (lastSep === "," && /,\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, "").replace(",", ".");
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    if (lastSep === "." && /\.\d{1,2}$/.test(t)) {
      t = t.replace(/,/g, "");
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    t = t.replace(/[.,]/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  if (hasComma) {
    // PERBAIKAN: koma HARUS diikuti 1–2 digit di akhir agar dianggap desimal
    if (/,\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, "").replace(",", ".");
      const f = Number(t);
      return Number.isFinite(f) ? Math.round(f) : null;
    }
    t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  if (hasDot) {
    t = t.replace(/\./g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseAmountLike(str) {
  if (!str) return null
  const m = String(str).match(/(?:rp\.?|idr)\s*([0-9][0-9.,]*)/i)
  if (!m) return null
  return normalizeRupiahFragment(m[1])
}
function flatStrings(obj, out = []) {
  if (obj == null) return out
  if (typeof obj === "string") {
    out.push(obj)
    return out
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    out.push(String(obj))
    return out
  }
  if (Array.isArray(obj)) {
    for (const v of obj) flatStrings(v, out)
    return out
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) flatStrings(obj[k], out)
    return out
  }
  return out
}

function parseAmountFromAnything(body = {}, raw = "") {
  const directKeys = ["amount", "total", "nominal", "value", "price"];
  let numericCandidate = null;

  for (const k of directKeys) {
    const v = body?.[k];
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      numericCandidate = Math.round(v);
      continue;
    }
    if (typeof v === "string") {
      const n = normalizeRupiahFragment(v);
      if (Number.isFinite(n)) return n;
    }
  }

  const allText = JSON.stringify(body) + " " + String(raw);

  const rpMatch = allText.match(/(?:rp\.?|idr)[\s:]*([0-9][0-9.,]*)/i);
  if (rpMatch) {
    const n = normalizeRupiahFragment(rpMatch[1]);
    if (Number.isFinite(n)) {
      if (numericCandidate != null && numericCandidate < 100 && n >= 100) return n;
      return n;
    }
  }

  const numberPatterns = [
    /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)/g,
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)/g,
    /(\d+[\.,]?\d*)/g
  ];

  const foundNumbers = [];
  for (const pattern of numberPatterns) {
    const matches = allText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const n = normalizeRupiahFragment(match);
        if (Number.isFinite(n)) foundNumbers.push(n);
      }
    }
  }

  if (foundNumbers.length) {
    const big = Math.max(...foundNumbers);
    if (Number.isFinite(big)) {
      if (numericCandidate != null && numericCandidate < 100 && big >= 100) return big;
      return big;
    }
  }

  return numericCandidate != null ? numericCandidate : null;
}

module.exports = { parseAmountFromAnything }