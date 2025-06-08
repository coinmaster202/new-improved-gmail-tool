import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// Load environment variables (used automatically in Railway)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.document) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name.toLowerCase();
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}-${fileName}`;

    const fileStream = fs.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", async () => {
        fileStream.close();
        let count = 0;
        if (fileName.endsWith(".csv")) {
          count = await insertFromCSV(tempPath);
        } else if (fileName.endsWith(".txt")) {
          count = await insertFromText(tempPath);
        } else if (fileName.endsWith(".json")) {
          count = await insertFromJSON(tempPath);
        } else {
          bot.sendMessage(chatId, "❌ Unsupported file format. Use CSV, TXT, or JSON.");
          fs.unlinkSync(tempPath);
          return;
        }
        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Done! ${count} new unlock codes added.`);
      });
    });
  } else if (msg.text && msg.text.startsWith("/clear")) {
    bot.sendMessage(chatId, "⚠️ Send /confirm within 15 seconds to clear ALL unlock codes from Redis.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm" && m.chat.id === chatId) {
        let deleted = 0;
        try {
          const allKeys = await redis.keys("*");
          for (const key of allKeys) {
            if (validPrefixes.some(p => key.startsWith(p))) {
              await redis.del(key);
              deleted++;
            }
          }
          bot.sendMessage(chatId, `🧹 Cleared ${deleted} codes from Redis.`);
        } catch (e) {
          bot.sendMessage(chatId, "❌ Error clearing Redis.");
        }
      }
    });
  } else if (msg.text && msg.text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const check = await redis.get("test-key");
      bot.sendMessage(chatId, check === "ok" ? "✅ Redis is online." : "❌ Redis issue.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
  }
});

async function insertFromCSV(path) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(path)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const line = Object.values(row).join(",").toLowerCase().trim();
        if (isValidCode(line)) {
          const added = await saveCode(line);
          if (added) count++;
        }
      })
      .on("end", () => resolve(count));
  });
}

async function insertFromText(path) {
  let count = 0;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const code = line.toLowerCase().trim();
    if (isValidCode(code)) {
      const added = await saveCode(code);
      if (added) count++;
    }
  }
  return count;
}

async function insertFromJSON(path) {
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    for (const item of codes) {
      const code = typeof item === "string" ? item.toLowerCase().trim() : "";
      if (isValidCode(code)) {
        const added = await saveCode(code);
        if (added) count++;
      }
    }
  } catch (e) {
    console.error("Invalid JSON file.");
  }
  return count;
}

function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^\d{6}$/.test(suffix);
}

async function saveCode(code) {
  try {
    const exists = await redis.get(code);
    if (!exists) {
      await redis.set(code, true);
      return true;
    }
  } catch (e) {
    console.error("Redis set error:", code, e);
  }
  return false;
}