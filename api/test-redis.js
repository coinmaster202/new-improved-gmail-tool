import express from "express";
import { Redis } from "@upstash/redis";

const router = express.Router();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

router.get("/", async (req, res) => {
  try {
    const key = "v500-testkey123";
    await redis.set(key, true);
    const value = await redis.get(key);
    res.status(200).json({ message: "✅ Redis test passed", value });
  } catch (err) {
    res.status(500).json({ error: "❌ Redis test failed", details: err.message });
  }
});

export default router;
