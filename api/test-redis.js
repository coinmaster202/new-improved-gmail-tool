import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const prefix = "v500";
  const insertedKey = `${prefix}-123456`;

  try {
    // Insert a test key
    await redis.set(insertedKey, true);

    // Fetch matching keys
    const keys = await redis.keys(`${prefix}-*`);
    const result = [];

    for (const key of keys) {
      const val = await redis.get(key);
      result.push({ key, value: val });
    }

    return res.status(200).json({
      message: `✅ Test key inserted: ${insertedKey}`,
      keysMatched: keys.length,
      entries: result,
    });
  } catch (e) {
    console.error("❌ Redis error:", e);
    return res.status(500).json({
      error: "❌ Redis test failed",
      details: e.message,
    });
  }
}
