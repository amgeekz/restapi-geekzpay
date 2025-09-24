const BASE  = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN || "");

function enc(s){ return encodeURIComponent(String(s)); }

async function callRedis(method, path, body){
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body
  });
  if (!res.ok){
    const txt = await res.text().catch(() => "");
    throw new Error(`Redis REST ${res.status}${txt ? `: ${txt}` : ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

async function redisLPushTrimExpire(key, valueObj, maxKeep, ttlSec) {
  const data = JSON.stringify(valueObj);
  await callRedis("POST", `/lpush/${enc(key)}`, JSON.stringify([data]));

  const stop = Math.max(0, Number(maxKeep) - 1);
  await callRedis("POST", `/ltrim/${enc(key)}/0/${stop}`);
  await callRedis("POST", `/expire/${enc(key)}/${Math.max(1, Number(ttlSec))}`);
}

async function redisLRangeJSON(key, start, stop){
  try {
    const out = await callRedis("GET", `/lrange/${enc(key)}/${Number(start)}/${Number(stop)}`);
    
    // Handle Upstash Redis response format: { result: [...] }
    const rawItems = out && out.result ? out.result : (Array.isArray(out) ? out : [out]);
    
    const parsed = [];
    for (let rawItem of rawItems) {
      let item = rawItem;
      
      // Handle triple-nested JSON: "[\"json_string\"]"
      if (typeof item === 'string') {
        try {
          // First parse: remove array wrapper
          const firstParse = JSON.parse(item);
          if (Array.isArray(firstParse) && firstParse.length > 0) {
            item = firstParse[0];
          } else {
            item = firstParse;
          }
          
          // Second parse: if still string, parse the actual JSON
          if (typeof item === 'string') {
            item = JSON.parse(item);
          }
        } catch (error) {
          // Fallback: clean and parse directly
          try {
            const clean = item.replace(/\\"/g, '"')
                             .replace(/^\["/, '')
                             .replace(/"\]$/, '');
            item = JSON.parse(clean);
          } catch {
            item = { raw: item };
          }
        }
      }
      
      if (item && typeof item === 'object') {
        parsed.push(item);
      }
    }
    
    return parsed;
  } catch (error) {
    console.error('redisLRangeJSON error:', error);
    return [];
  }
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };