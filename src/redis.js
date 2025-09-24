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
    
    let arr = [];
    if (Array.isArray(out)) {
      arr = out;
    } else if (out && Array.isArray(out.result)) {
      arr = out.result;
    } else if (out && typeof out === 'object') {
      arr = Object.keys(out)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => out[key]);
    }
    
    const parsed = [];
    for (let v of arr) {
      let item = v;
      
      if (typeof item === 'string') {
        try {
          let cleanString = item;
          if (cleanString.includes('\\"')) {
            cleanString = cleanString.replace(/\\"/g, '"');
          }
          if (cleanString.startsWith('"') && cleanString.endsWith('"')) {
            cleanString = cleanString.slice(1, -1);
          }
          
          item = JSON.parse(cleanString);
        } catch (parseError) {
          item = { raw: item };
        }
      }
      
      if (item && typeof item === 'object') {
        parsed.push(item);
      } else {
        parsed.push({});
      }
    }
    
    return parsed;
  } catch (error) {
    console.error('redisLRangeJSON error:', error);
    return [];
  }
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };