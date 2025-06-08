import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import https from "https";
import csvParser from "csv-parser";

// ✅ Configure from Railway variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 📦 Telegram bot setup
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const confirmMap = new Map(); // track who issued /clear

// 🔐 Accept files (CSV, TXT, JSON)
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const fileName = msg.document.file_name.toLowerCase();
  const fileId = msg.document.file_id;
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const tempPath = `./temp-${Date.now()}-${fileName}`;
  const stream = fs.createWriteStream(tempPath);

  https.get(fileUrl, (res) => {
    res.pipe(stream);
    stream.on("finish", async () => {
      stream.close();
      let added = 0;

      if (fileName.endsWith(".csv")) {
        added = await loadCSV(tempPath);
      } else if (fileName.endsWith(".json")) {
        added = await loadJSON(tempPath);
      } else if (fileName.endsWith(".txt")) {
        added = await loadTXT(tempPath);
      }

      fs.unlinkSync(tempPath);
      bot.sendMessage(chatId, `✅ Done! ${added} valid codes added.`);
    });
  });
});

// 🧹 Clear command with confirmation
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  confirmMap.set(chatId, true);
  bot.sendMessage(chatId, "⚠️ Are you sure you want to delete ALL unlock codes from Redis?\nReply with `/confirm` within 60 seconds to proceed.");
  setTimeout(() => confirmMap.delete(chatId), 60000);
});

bot.onText(/\/confirm/, async (msg) => {
  const chatId = msg.chat.id;
  if (!confirmMap.has(chatId)) {
    return bot.sendMessage(chatId, "⛔ No pending /clear command.");
  }

  confirmMap.delete(chatId);

  try {
    const keys = await redis.keys("*");
    const unlockKeys = keys.filter((k) =>
      validPrefixes.some((p) => k.toLowerCase().startsWith(p))
    );
    if (unlockKeys.length === 0) {
      return bot.sendMessage(chatId, "ℹ️ No unlock codes found in Redis.");
    }

    await Promise.all(unlockKeys.map((k) => redis.del(k)));
    bot.sendMessage(chatId, `🧹 Cleared ${unlockKeys.length} unlock codes.`);
  } catch (err) {
    console.error("Clear error:", err);
    bot.sendMessage(chatId, "❌ Failed to clear codes.");
  }
});

// 🧠 Helpers
async function loadCSV(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const code = Object.values(row)[0]?.toLowerCase().trim();
        if (isValidCode(code)) {
          const exists = await redis.get(code);
          if (!exists) {
            await redis.set(code, true);
            count++;
          }
        }
      })
      .on("end", () => resolve(count));
  });
}

async function loadTXT(filePath) {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let count = 0;
  for (const line of lines) {
    const code = line.trim().toLowerCase();
    if (isValidCode(code)) {
      const exists = await redis.get(code);
      if (!exists) {
        await redis.set(code, true);
        count++;
      }
    }
  }
  return count;
}

async function loadJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  let data = [];
  try {
    data = JSON.parse(raw);
  } catch {
    return 0;
  }
  let count = 0;
  for (const code of data) {
    const clean = code.trim().toLowerCase();
    if (isValidCode(clean)) {
      const exists = await redis.get(clean);
      if (!exists) {
        await redis.set(clean, true);
        count++;
      }
    }
  }
  return count;
}

function isValidCode(code) {
  const [prefix, suffix] = code?.split("-");
  return validPrefixes.includes(prefix) && suffix?.length >= 4;
}

console.log("🤖 Telegram bot is running and listening...");
