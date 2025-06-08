import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import csvParser from "csv-parser";
import https from "https";
import fs from "fs";

// 🔐 Load from Railway environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // ✅ Validate file
  if (!msg.document || !msg.document.file_name.endsWith(".csv")) {
    bot.sendMessage(chatId, "📎 Please send a valid .csv file with unlock codes.");
    return;
  }

  try {
    const fileId = msg.document.file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}.csv`;

    // ⬇ Download CSV
    const fileStream = fs.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", async () => {
        fileStream.close();
        const inserted = await insertCodesFromCSV(tempPath);
        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Upload complete. ${inserted} valid codes added.`);
      });
    });
  } catch (err) {
    console.error("❌ Telegram bot CSV error:", err);
    bot.sendMessage(chatId, "❌ Failed to process the CSV file.");
  }
});

async function insertCodesFromCSV(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const code = Object.values(row)[0]?.trim().toLowerCase();
        const [prefix, suffix] = code?.split("-") || [];

        if (validPrefixes.includes(prefix) && suffix?.length === 6) {
          try {
            const exists = await redis.get(code);
            if (!exists) {
              await redis.set(code, true);
              count++;
            }
          } catch (err) {
            console.error("Redis error for code:", code, err);
          }
        }
      })
      .on("end", () => resolve(count));
  });
}
