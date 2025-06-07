import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fetch from "node-fetch";
import csvParser from "csv-parser";
import https from "https";
import fs from "fs";

// Replace with your actual Railway variables or keep using Railway env vars
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document || !msg.document.file_name.endsWith(".csv")) {
    return bot.sendMessage(chatId, "📎 Please upload a .csv file with mode and code columns.");
  }

  const fileId = msg.document.file_id;
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const tempPath = `./upload-${Date.now()}.csv`;

  const stream = fs.createWriteStream(tempPath);
  https.get(fileUrl, (res) => {
    res.pipe(stream);
    stream.on("finish", async () => {
      stream.close();
      const total = await processCsv(tempPath, chatId);
      fs.unlinkSync(tempPath);
      bot.sendMessage(chatId, `✅ Upload complete! ${total} new codes added to Redis.`);
    });
  });
});

async function processCsv(filePath, chatId) {
  return new Promise((resolve) => {
    let count = 0;

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", async (row) => {
        const mode = row.mode?.toLowerCase().trim();
        const code = row.code?.trim();

        if (!validPrefixes.includes(mode)) return;
        if (!code?.startsWith(mode + "-") || code.length < 10) return;

        try {
          const exists = await redis.get(code);
          if (!exists) {
            await redis.set(code, true);
            count++;
          }
        } catch (err) {
          console.error("Redis insert error:", err);
        }
      })
      .on("end", () => resolve(count));
  });
}