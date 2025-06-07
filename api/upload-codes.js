import { Redis } from "@upstash/redis";
import csv from "csvtojson";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Only POST allowed");

  try {
    const raw = await req.text();
    const codes = await csv({ noheader: true, output: "csv" }).fromString(raw);
    let count = 0;

    for (const [code] of codes) {
      await redis.set(code, "valid");
      count++;
    }

    res.status(200).json({ message: `✅ Uploaded ${count} codes.` });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}