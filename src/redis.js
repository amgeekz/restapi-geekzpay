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

// redis.js - Perbaiki fungsi redisLRangeJSON
async function redisLRangeJSON(key, start, stop){
  try {
    const out = await callRedis("GET", `/lrange/${enc(key)}/${Number(start)}/${Number(stop)}`);
    console.log('Redis raw response type:', typeof out);
    
    // Fix: Handle different response formats
    let arr = [];
    if (Array.isArray(out)) {
      arr = out;
    } else if (out && Array.isArray(out.result)) {
      arr = out.result;
    } else if (out && typeof out === 'object') {
      arr = Object.values(out);
    } else if (typeof out === 'string') {
      try {
        const parsed = JSON.parse(out);
        if (Array.isArray(parsed)) arr = parsed;
        else if (Array.isArray(parsed.result)) arr = parsed.result;
      } catch {
        arr = [out];
      }
    }
    
    console.log('Parsed array length:', arr.length);
    
    const parsed = [];
    for (let v of arr) {
      let item = v;
      
      // Handle nested JSON strings
      if (typeof item === 'string') {
        try {
          // Remove extra escaping if exists
          let cleanString = item.replace(/\\"/g, '"').replace(/^"+|"+$/g, '');
          item = JSON.parse(cleanString);
        } catch (parseError) {
          console.log('JSON parse failed, trying direct parse:', parseError.message);
          try {
            item = JSON.parse(item);
          } catch {
            console.log('Using raw string value');
            item = { raw: item };
          }
        }
      }
      
      // If we get another string after first parse, try parse again
      if (typeof item === 'string') {
        try {
          item = JSON.parse(item);
        } catch {
          // Keep as string object
          item = { raw: item };
        }
      }
      
      if (item && typeof item === 'object') {
        parsed.push(item);
      } else {
        console.log('Skipping invalid item:', typeof item);
        parsed.push({});
      }
    }
    
    console.log('Final parsed events:', parsed.length);
    return parsed;
  } catch (error) {
    console.error('redisLRangeJSON error:', error);
    return [];
  }
}

// redis.js - Perbaiki fungsi redisLRangeJSON
async function redisLRangeJSON(key, start, stop){
  try {
    const out = await callRedis("GET", `/lrange/${enc(key)}/${Number(start)}/${Number(stop)}`);
    console.log('Redis raw response type:', typeof out);
    
    // Fix: Handle different response formats
    let arr = [];
    if (Array.isArray(out)) {
      arr = out;
    } else if (out && Array.isArray(out.result)) {
      arr = out.result;
    } else if (out && typeof out === 'object') {
      arr = Object.values(out);
    } else if (typeof out === 'string') {
      try {
        const parsed = JSON.parse(out);
        if (Array.isArray(parsed)) arr = parsed;
        else if (Array.isArray(parsed.result)) arr = parsed.result;
      } catch {
        arr = [out];
      }
    }
    
    console.log('Parsed array length:', arr.length);
    
    const parsed = [];
    for (let v of arr) {
      let item = v;
      
      // Handle nested JSON strings
      if (typeof item === 'string') {
        try {
          // Remove extra escaping if exists
          let cleanString = item.replace(/\\"/g, '"').replace(/^"+|"+$/g, '');
          item = JSON.parse(cleanString);
        } catch (parseError) {
          console.log('JSON parse failed, trying direct parse:', parseError.message);
          try {
            item = JSON.parse(item);
          } catch {
            console.log('Using raw string value');
            item = { raw: item };
          }
        }
      }
      
      // If we get another string after first parse, try parse again
      if (typeof item === 'string') {
        try {
          item = JSON.parse(item);
        } catch {
          // Keep as string object
          item = { raw: item };
        }
      }
      
      if (item && typeof item === 'object') {
        parsed.push(item);
      } else {
        console.log('Skipping invalid item:', typeof item);
        parsed.push({});
      }
    }
    
    console.log('Final parsed events:', parsed.length);
    return parsed;
  } catch (error) {
    console.error('redisLRangeJSON error:', error);
    return [];
  }
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };