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
    console.log('Redis raw response:', JSON.stringify(out).substring(0, 500));
    
    // Fix: Handle different response formats from Upstash
    let arr = [];
    if (Array.isArray(out)) {
      arr = out;
    } else if (out && Array.isArray(out.result)) {
      arr = out.result;
    } else if (out && typeof out === 'object') {
      arr = Object.values(out);
    }
    
    console.log('Parsed array:', arr.length, 'items');
    
    const parsed = [];
    for (let v of arr) {
      if (typeof v === 'string') {
        try { 
          v = JSON.parse(v); 
          console.log('Successfully parsed JSON string');
        } catch (parseError) { 
          console.log('Failed to parse as JSON, using as text:', v.substring(0, 100));
          v = { raw: v }; // Fallback jika bukan JSON
        }
      }
      
      // Pastikan v adalah object yang valid
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        parsed.push(v);
      } else {
        console.log('Skipping invalid item:', typeof v, v);
        parsed.push({}); // Item kosong sebagai fallback
      }
    }
    
    console.log('Final parsed events:', parsed.length);
    return parsed;
  } catch (error) {
    console.error('redisLRangeJSON error:', error);
    return []; // Return empty array instead of crashing
  }
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };