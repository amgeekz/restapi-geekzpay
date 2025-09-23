const REST_URL  = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function callRedis(commandArray) {
  if (!REST_URL || !REST_TOKEN) throw new Error('Redis REST env missing');
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command: commandArray })
  });
  if (!r.ok) throw new Error(`Redis REST ${r.status}`);
  const j = await r.json();
  return j.result;
}

async function redisLPushTrimExpire(key, jsonString, maxKeep, ttlSec) {
  await callRedis(['LPUSH', key, jsonString]);
  await callRedis(['LTRIM', key, '0', String(maxKeep - 1)]);
  await callRedis(['EXPIRE', key, String(ttlSec)]);
}

async function redisLRangeJSON(key, start, stop) {
  const arr = await callRedis(['LRANGE', key, String(start), String(stop)]);
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    try { out.push(JSON.parse(s)); } catch { /* skip */ }
  }
  return out;
}

module.exports = { redisLPushTrimExpire, redisLRangeJSON };