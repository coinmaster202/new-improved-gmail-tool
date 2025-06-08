import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const code = "v500-123456";

  try {
    await redis.set(code, true);
    const value = await redis.get(code);
    return res.status(200).json({
      message: `✅ Code inserted: ${code}`,
      value,
    });
  } catch (e) {
    return res.status(500).json({
      error: "❌ Redis insert failed",
      details: e.message,
    });
  }
}
