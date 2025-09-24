const BASE  = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN || "");

function enc(s){ return encodeURIComponent(String(s)); }

async function callRedis(method, path, body){
  if (!BASE || !TOKEN) throw new Error("Redis env missing");
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

async function redisLPushTrimExpire(key, valueObj, maxKeep, ttlSec){
  // stringify SEKALI saja (obj -> string)
  const element = JSON.stringify(valueObj);
  // Upstash lpush body = array of elements
  await callRedis("POST", `/lpush/${enc(key)}`, JSON.stringify([element]));
  const stop = Math.max(0, Number(maxKeep) - 1);
  await callRedis("POST", `/ltrim/${enc(key)}/0/${stop}`);
  await callRedis("POST", `/expire/${enc(key)}/${Math.max(1, Number(ttlSec))}`);
}

// parser tahan banting: parse 0, 1, bahkan 2 lapis bila perlu
function safeParseDeep(v){
  let out = v;
  if (typeof out === "string"){
    try { out = JSON.parse(out); } catch {}
  }
  if (typeof out === "string"){
    try { out = JSON.parse(out); } catch {}
  }
  return (out && typeof out === "object") ? out : null;
}

async function redisLRangeJSON(key, start, stop){
  const out = await callRedis("GET", `/lrange/${enc(key)}/${Number(start)}/${Number(stop)}`);
  const arr = out && out.result ? out.result : [];
  const parsed = [];
  for (const item of arr){
    const obj = safeParseDeep(item);
    if (obj) parsed.push(obj);
  }
  return parsed;
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };