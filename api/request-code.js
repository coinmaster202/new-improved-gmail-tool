import { Redis } from "@upstash/redis";
import fetch from "node-fetch";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Only POST allowed");

  const { mode } = req.body;
  const prefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
  if (!prefixes.includes(mode)) return res.status(400).json({ error: "Invalid mode" });

  try {
    const allKeys = await redis.keys(`${mode}-*`);
    const unused = [];

    for (const key of allKeys) {
      const val = await redis.get(key);
      if (val === "valid") unused.push(key);
    }

    if (unused.length === 0) return res.status(404).json({ error: "No codes left" });

    const chosen = unused[Math.floor(Math.random() * unused.length)];
    await redis.set(chosen, "used");

    // Send to Telegram
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `🎟️ Unlock Code for ${mode}: ${chosen}`
      })
    });

    res.status(200).json({ message: "Code sent to Telegram" });
  } catch (err) {
    console.error("Request error:", err);
    res.status(500).json({ error: "Failed to send code" });
  }
}