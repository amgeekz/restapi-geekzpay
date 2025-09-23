const { Redis } = require("@upstash/redis");

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function rpushTrimExpire(key, value, max, ttlSec) {
  await redis
    .pipeline()
    .lpush(key, value)
    .ltrim(key, 0, max - 1)
    .expire(key, ttlSec)
    .exec();
}

async function lrangePruned(key, max) {
  const items = await redis.lrange(key, 0, max - 1);
  return items || [];
}

module.exports = { redis, rpushTrimExpire, lrangePruned };