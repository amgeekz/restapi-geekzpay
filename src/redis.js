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
    
    console.log('Redis response structure:', Array.isArray(out) ? `Array with ${out.length} items` : typeof out);
    
    let items = [];
    if (Array.isArray(out)) {
      if (out.length > 0 && Array.isArray(out[0])) {
        items = out.flat();
      } else {
        items = out;
      }
    } else {
      items = [out];
    }
    
    console.log('Items to parse:', items.length);
    
    const parsed = [];
    for (let item of items) {
      if (typeof item === 'string') {
        try {
          const parsedItem = JSON.parse(item);
          parsed.push(parsedItem);
        } catch (error) {
          console.log('Parse error, using raw:', error.message);
          parsed.push({ raw: item });
        }
      } else if (item && typeof item === 'object') {
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