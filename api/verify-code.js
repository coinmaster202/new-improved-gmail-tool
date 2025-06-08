import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { code } = req.body;
  if (!code || typeof code !== "string" || !code.includes("-")) {
    return res.status(400).json({ error: "Invalid code format" });
  }

  const redisKey = code.toLowerCase();
  const [prefix, suffix] = redisKey.split("-");
  const limits = { v200: 200, v500: 500, v1000: 1000, v5000: 5000, unlimt: Infinity };

  if (!limits[prefix] || !/^[a-z0-9]{6}$/.test(suffix)) {
    return res.status(400).json({ error: "Invalid format or code" });
  }

  try {
    const exists = await redis.get(redisKey);
    if (!exists) {
      return res.status(403).json({ error: "Code not found or already used" });
    }

    await redis.del(redisKey); // ✅ Mark as used
    return res.status(200).json({ max: limits[prefix] });
  } catch (e) {
    console.error("Redis error:", e);
    return res.status(500).json({ error: "Redis server error" });
  }
}
