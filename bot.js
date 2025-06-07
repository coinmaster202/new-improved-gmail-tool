import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import csvParser from "csv-parser";
import https from "https";
import fs from "fs";

// ✅ Your bot token and Redis setup (use Railway env vars)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ✅ Restrict to your Telegram user
const ALLOWED_USERS = ["6630390831"]; // <- Replace with your Telegram user ID

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (!ALLOWED_USERS.includes(userId)) {
    bot.sendMessage(chatId, "🚫 You're not allowed to upload codes.");
    return;
  }

  if (!msg.document || !msg.document.file_name.endsWith(".csv")) {
    bot.sendMessage(chatId, "📎 Please send a valid .csv file.");
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
    const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const code = Object.values(row)[0]?.toLowerCase().trim();
        const [prefix, suffix] = code.split("-");
        if (validPrefixes.includes(prefix) && suffix?.length === 6) {
          try {
            const exists = await redis.get(code);
            if (!exists) {
              await redis.set(code, true);
              console.log(`✅ Inserted: ${code}`);
              count++;
            } else {
              console.log(`⚠️ Skipped duplicate: ${code}`);
            }
          } catch (err) {
            console.error("Redis error:", err);
          }
        } else {
          console.log(`❌ Invalid format: ${code}`);
        }
      })
      .on("end", () => {
        resolve(count);
      });
  });
}