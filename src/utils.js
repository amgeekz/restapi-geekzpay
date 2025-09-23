function onlyDigits(str) {
  return (str || '').replace(/[^0-9]/g, '');
}
function normalizeRupiahFragment(s) {
  if (!s) return null
  let t = String(s).trim()
  t = t.replace(/[^\d.,]/g, "")
  if (!t) return null
  const hasDot = t.includes(".")
  const hasComma = t.includes(",")
  if (hasDot && hasComma) {
    const lastSep = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ","
    if (lastSep === "," && /,\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, "").replace(",", ".")
      const f = Number(t)
      return Number.isFinite(f) ? Math.round(f) : null
    }
    if (lastSep === "." && /\.\d{1,2}$/.test(t)) {
      t = t.replace(/,/g, "")
      const f = Number(t)
      return Number.isFinite(f) ? Math.round(f) : null
    }
    t = t.replace(/[.,]/g, "")
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  if (hasComma) {
    if (/,?\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, "").replace(",", ".")
      const f = Number(t)
      return Number.isFinite(f) ? Math.round(f) : null
    }
    t = t.replace(/,/g, "")
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  if (hasDot) {
    t = t.replace(/\./g, "")
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
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
  const directKeys = ["amount", "total", "nominal", "value", "price"]
  for (const k of directKeys) {
    const v = body?.[k]
    if (v == null) continue
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v)
    const n = parseAmountLike(String(v)) ?? normalizeRupiahFragment(String(v))
    if (Number.isFinite(n)) return n
  }
  const allTexts = flatStrings(body)
  if (raw) allTexts.push(String(raw))
  let tagged = []
  const rpRe = /(rp\.?|idr)\s*([0-9][0-9.,]*)/gi
  for (const s of allTexts) {
    let m
    while ((m = rpRe.exec(String(s))) !== null) {
      const n = normalizeRupiahFragment(m[2])
      if (Number.isFinite(n)) tagged.push(n)
    }
  }
  if (tagged.length) {
    const big = Math.max(...tagged)
    if (Number.isFinite(big)) return big
  }
  let nums = []
  const numRe = /\b\d[\d.,]{1,}\b/g
  for (const s of allTexts) {
    let m
    while ((m = numRe.exec(String(s))) !== null) {
      const n = normalizeRupiahFragment(m[0])
      if (Number.isFinite(n)) nums.push(n)
    }
  }
  if (nums.length) {
    const filtered = nums.filter(n => n >= 100 && n <= 1e12)
    if (filtered.length) return Math.max(...filtered)
    return Math.max(...nums)
  }
  return null
}

module.exports = { parseAmountFromAnything }