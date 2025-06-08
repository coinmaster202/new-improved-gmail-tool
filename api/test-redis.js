import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    // Accept GET and POST for debugging
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "Only GET or POST allowed" });
    }

    const testKey = "v500-testkey123";
    await redis.set(testKey, true);
    const value = await redis.get(testKey);

    res.status(200).json({
      message: `✅ Code inserted: ${testKey}`,
      value,
    });
  } catch (err) {
    res.status(500).json({
      error: "❌ Redis test failed",
      details: err.message || err.toString(),
    });
  }
}
