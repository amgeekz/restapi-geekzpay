/**
 * QRIS tools: TLV (EMVCo) parsing/building + amount injection + CRC16-CCITT
 */
function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
      crc &= 0xFFFF;
    }
  }
  return (crc.toString(16).toUpperCase()).padStart(4, '0');
}

function parseTLV(payload) {
  const fields = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.substr(i, 2);
    const lenStr = payload.substr(i + 2, 2);
    if (!/^[0-9]{2}$/.test(lenStr)) break;
    const len = parseInt(lenStr, 10);
    const start = i + 4;
    const end = start + len;
    const value = payload.substring(start, end);
    fields.push({ tag, len, value });
    i = end;
    // Guard break if malformed
    if (len <= 0) break;
  }
  return fields;
}

function buildTLV(fields) {
  return fields.map(f => f.tag + String(f.value.length).padStart(2, '0') + f.value).join('');
}

function setOrInsert(fields, tag, value, afterTag) {
  let found = false;
  for (const f of fields) {
    if (f.tag === tag) {
      f.value = value;
      f.len = value.length;
      found = true;
      break;
    }
  }
  if (!found) {
    if (afterTag) {
      const idx = fields.findIndex(f => f.tag === afterTag);
      if (idx >= 0) fields.splice(idx + 1, 0, { tag, len: value.length, value });
      else fields.push({ tag, len: value.length, value });
    } else {
      fields.push({ tag, len: value.length, value });
    }
  }
}

function removeTag(fields, tag) {
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].tag === tag) fields.splice(i, 1);
  }
}

/**
 * Make dynamic payload by injecting amount (tag '54') and recomputing CRC (tag '63').
 * amount is integer rupiah or number -> formatted to 2 decimals (e.g., 10338 -> '10338.00').
 */
function makeDynamic(staticPayload, amount) {
  if (!staticPayload || typeof staticPayload !== 'string') {
    throw new Error('Invalid static payload');
  }
  // Remove trailing CRC if present
  let payload = staticPayload.replace(/6304[0-9A-Fa-f]{4}$/,'');

  // Parse TLV
  let fields = parseTLV(payload);
  // Remove any existing 54/63
  removeTag(fields, '63');
  removeTag(fields, '54');

  // Insert amount after 53 (transaction currency) if present
  const amtStr = Number(amount).toFixed(2);
  setOrInsert(fields, '54', amtStr, '53');

  // Build without CRC
  const partial = buildTLV(fields);
  const beforeCRC = partial + '63' + '04';
  const crc = crc16ccitt(beforeCRC);
  return beforeCRC + crc;
}

module.exports = { makeDynamic, crc16ccitt, parseTLV, buildTLV };
