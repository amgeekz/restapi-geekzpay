const BASE = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(//+$/, "");
const TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN || "");

function enc(s) { return encodeURIComponent(String(s)); }

async function callRedis(method, path, body) {
const url = BASE + path;
const opt = {
method,
headers: {
"Authorization": Bearer ${TOKEN},
"Content-Type": "application/json",
},
};
if (body !== undefined) opt.body = body;
const res = await fetch(url, opt);
if (!res.ok) {
const txt = await res.text().catch(() => "");
throw new Error(Redis REST ${res.status}${txt ? : ${txt} : ""});
}
const ct = res.headers.get("content-type") || "";
if (ct.includes("application/json")) {
return await res.json();
}
return await res.text();
}

async function redisLPushTrimExpire(key, value, maxKeep, ttlSec) {
if (!BASE || !TOKEN) throw new Error("Redis env missing");
await callRedis("POST", /lpush/${enc(key)}, JSON.stringify(value));
const stop = Math.max(0, Number(maxKeep) - 1);
await callRedis("POST", /ltrim/${enc(key)}/0/${stop});
await callRedis("POST", /expire/${enc(key)}/${Math.max(1, Number(ttlSec))});
}

async function redisLRangeJSON(key, start, stop) {
if (!BASE || !TOKEN) throw new Error("Redis env missing");
const out = await callRedis("GET", /lrange/${enc(key)}/${Number(start)}/${Number(stop)});
const arr = out && out.result ? out.result : [];
const parsed = [];
for (const s of arr) {
try {
parsed.push(JSON.parse(s));
} catch {}
}
return parsed;
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };

