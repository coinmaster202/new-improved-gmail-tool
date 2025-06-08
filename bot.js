import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import https from "https";
import csvParser from "csv-parser";

// Setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

// 🧠 Core Logic
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  // ✅ Ping test
  if (text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const value = await redis.get("test-key");
      bot.sendMessage(chatId, value === "ok" ? "✅ Redis is online." : "❌ Redis check failed.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // 🎟️ Dispense code
  if (text?.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1];

    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Use like /code v200 or /code v1000");
      return;
    }

    try {
      const keys = await redis.keys(`${mode}-*`);
      const available = [];

      for (const key of keys) {
        const val = await redis.get(key);
        if (val) available.push(key);
      }

      if (!available.length) {
        bot.sendMessage(chatId, "❌ No codes left in that mode.");
        return;
      }

      const code = available[Math.floor(Math.random() * available.length)];
      await redis.del(code);
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
    } catch (e) {
      console.error("Redis fetch error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
    }
    return;
  }

  // 🧼 Confirm-based clear
  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ This will delete ALL codes. Type /confirm-clear within 10 seconds to proceed.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm-clear" && m.chat.id === chatId) {
        let deleted = 0;
        for (const prefix of validPrefixes) {
          const keys = await redis.keys(`${prefix}-*`);
          for (const key of keys) {
            await redis.del(key);
            deleted++;
          }
        }
        bot.sendMessage(chatId, `🧹 Cleared ${deleted} codes from Redis.`);
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }

  // 📁 Handle file uploads (.txt, .csv, .json)
  if (msg.document) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name.toLowerCase();
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}-${fileName}`;

    const stream = fs.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(stream);
      stream.on("finish", async () => {
        stream.close();
        let count = 0;
        if (fileName.endsWith(".csv")) count = await insertFromCSV(tempPath);
        else if (fileName.endsWith(".txt")) count = await insertFromText(tempPath);
        else if (fileName.endsWith(".json")) count = await insertFromJSON(tempPath);
        else {
          bot.sendMessage(chatId, "❌ Unsupported file format (use .csv, .txt or .json).");
          fs.unlinkSync(tempPath);
          return;
        }
        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Uploaded ${count} valid codes.`);
      });
    });
    return;
  }
});

// 🧩 Helpers
function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/i.test(suffix);
}

async function saveCode(code) {
  const exists = await redis.get(code);
  if (!exists) {
    await redis.set(code, true);
    return true;
  }
  return false;
}

async function insertFromText(path) {
  let count = 0;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const code = line.trim().toLowerCase();
    if (isValidCode(code) && await saveCode(code)) count++;
  }
  return count;
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

async function insertFromJSON(path) {
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    for (const val of codes) {
      const code = typeof val === "string" ? val.trim().toLowerCase() : "";
      if (isValidCode(code) && await saveCode(code)) count++;
    }
  } catch (e) {
    console.error("Invalid JSON:", e);
  }
  return count;
}

console.log("🤖 Telegram bot running and ready.");