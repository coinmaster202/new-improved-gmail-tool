import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fetch from "node-fetch";
import csvParser from "csv-parser";
import https from "https";
import fs from "fs";

// ENV-style config (loaded from Railway variables)
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
    bot.sendMessage(chatId, "📎 Please send a valid .csv file with `mode,code` headers.");
    return;
  }

  const fileId = msg.document.file_id;
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const tempPath = `./temp-${Date.now()}.csv`;
  const fileStream = fs.createWriteStream(tempPath);

  https.get(fileUrl, (res) => {
    res.pipe(fileStream);
    fileStream.on("finish", async () => {
      fileStream.close();
      const inserted = await insertCodesFromCSV(tempPath, chatId);
      fs.unlinkSync(tempPath);
      bot.sendMessage(chatId, `✅ Done! ${inserted} new codes added.`);
    });
  });
});

async function insertCodesFromCSV(filePath, chatId) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser()) // Parses CSV with headers like 'mode','code'
      .on("data", async (row) => {
        const prefix = row.mode?.trim().toLowerCase();
        const suffix = row.code?.trim().toUpperCase();
        const code = `${prefix}-${suffix}`;

        if (validPrefixes.includes(prefix) && suffix?.length === 6) {
          try {
            const exists = await redis.get(code);
            if (!exists) {
              await redis.set(code, true);
              count++;
            }
          } catch (err) {
            console.error("Redis insert failed:", code, err.message);
          }
        }
      })
      .on("end", () => {
        resolve(count);
      });
  });
}