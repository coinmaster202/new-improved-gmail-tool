import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const prefix = "v500";
  const insertedKey = `${prefix}-123456`;

  try {
    // Insert a test key to make sure connection is fine
    await redis.set(insertedKey, true);

    // Use SCAN to fetch keys
    const result = [];
    for await (const key of redis.scanIterator({ match: `${prefix}-*` })) {
      const val = await redis.get(key);
      result.push({ key, value: val });
    }

    return res.status(200).json({
      message: `✅ SCAN completed for ${prefix}-*`,
      total: result.length,
      entries: result,
    });
  } catch (e) {
    console.error("❌ Redis SCAN error:", e);
    return res.status(500).json({
      error: "❌ Redis test failed",
      details: e.message,
    });
  }
}
