import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    let totalDeleted = 0;

    for (const prefix of validPrefixes) {
      let cursor = 0;

      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: `${prefix}-*`,
          count: 100,
        });

        cursor = nextCursor;

        if (keys.length > 0) {
          const deletions = await Promise.all(keys.map(k => redis.del(k)));
          totalDeleted += deletions.filter(Boolean).length;
        }
      } while (cursor !== 0);
    }

    return res.status(200).json({ message: `✅ Deleted ${totalDeleted} keys.` });
  } catch (err) {
    console.error("❌ Redis deletion error:", err);
    return res.status(500).json({ error: "Redis deletion failed", details: err.message });
  }
}
