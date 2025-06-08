import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

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
    return;
  }

  if (msg.text && msg.text.startsWith("/clear")) {
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
    return;
  }

  if (msg.text && msg.text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const check = await redis.get("test-key");
      bot.sendMessage(chatId, check === "ok" ? "✅ Redis is online." : "❌ Redis issue.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  if (msg.text && msg.text.startsWith("/code")) {
    const args = msg.text.trim().split(" ");
    const mode = args[1] ? args[1].toLowerCase() : null;

    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, v5000, unlimt)");
      return;
    }

    try {
      const keys = await redis.keys(`${mode}-*`);
      console.log(`🔍 Keys matching ${mode}-*:`, keys);

      const unused = [];
      for (const key of keys) {
        const val = await redis.get(key);
        console.log(`🔎 Check key: ${key} →`, val);
        if (val === true || val === "true") unused.push(key);
      }

      console.log("✅ Unused codes:", unused);

      if (unused.length === 0) {
        bot.sendMessage(chatId, "❌ No codes left for that mode.");
        return;
      }

      const code = unused[Math.floor(Math.random() * unused.length)];
      console.log("🎟️ Dispensing code:", code);
      await redis.del(code);

      bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
    } catch (err) {
      console.error("❌ ERROR while fetching Redis codes:", err);
      bot.sendMessage(chatId, "❌ Failed to fetch code from Redis.");
    }
    return;
  }
});

// --- Helpers ---
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

async function insertFromCSV(path) {
  return new Promise((resolve) => {
    let count = 0;
    const pending = [];
    fs.createReadStream(path)
      .pipe(csvParser({ headers: false }))
      .on("data", (row) => {
        const line = Object.values(row).join(",").toLowerCase().trim();
        if (isValidCode(line)) {
          pending.push(saveCode(line).then((added) => { if (added) count++; }));
        }
      })
      .on("end", async () => {
        await Promise.all(pending);
        resolve(count);
      });
  });
}

async function insertFromText(path) {
  let count = 0;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  const pending = [];
  for (const line of lines) {
    const code = line.toLowerCase().trim();
    if (isValidCode(code)) {
      pending.push(saveCode(code).then((added) => { if (added) count++; }));
    }
  }
  await Promise.all(pending);
  return count;
}

async function insertFromJSON(path) {
  let count = 0;
  const pending = [];
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    for (const item of codes) {
      const code = typeof item === "string" ? item.toLowerCase().trim() : "";
      if (isValidCode(code)) {
        pending.push(saveCode(code).then((added) => { if (added) count++; }));
      }
    }
  } catch (e) {
    console.error("Invalid JSON file.");
  }
  await Promise.all(pending);
  return count;
}

console.log("🤖 Telegram bot listener initialized.");
