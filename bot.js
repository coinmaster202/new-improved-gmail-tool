import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// ✅ ENVIRONMENT SETUP
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// 🤖 MESSAGE HANDLER
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // 📁 Handle file uploads
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
        if (fileName.endsWith(".csv")) count = await insertFromCSV(tempPath);
        else if (fileName.endsWith(".txt")) count = await insertFromText(tempPath);
        else if (fileName.endsWith(".json")) count = await insertFromJSON(tempPath);
        else {
          bot.sendMessage(chatId, "❌ Unsupported file format.");
          fs.unlinkSync(tempPath);
          return;
        }
        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Uploaded ${count} valid codes.`);
      });
    });
    return;
  }

  // 🧪 Ping Redis
  if (msg.text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const test = await redis.get("test-key");
      bot.sendMessage(chatId, test === "ok" ? "✅ Redis is online." : "❌ Redis failed.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // 🎟️ Dispense code
  if (msg.text?.startsWith("/code")) {
    const args = msg.text.trim().split(" ");
    const mode = args[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
      return;
    }

    try {
      const keys = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      const available = [];

      for await (const key of keys) {
        const val = await redis.get(key);
        if (val) available.push(key);
      }

      if (!available.length) {
        bot.sendMessage(chatId, "❌ No codes available for that mode.");
        return;
      }

      const selected = available[Math.floor(Math.random() * available.length)];
      await redis.del(selected);
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (err) {
      console.error("❌ Error pulling code:", err);
      bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
    }
    return;
  }

  // ⚠️ Clear all codes
  if (msg.text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm-clear in 10s to delete ALL codes.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm-clear" && m.chat.id === chatId) {
        let deleted = 0;
        try {
          for (const prefix of validPrefixes) {
            const keys = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
            for await (const key of keys) {
              await redis.del(key);
              deleted++;
            }
          }
          bot.sendMessage(chatId, `✅ Deleted ${deleted} Redis codes.`);
        } catch (e) {
          console.error("❌ Error deleting:", e);
          bot.sendMessage(chatId, "❌ Failed to clear Redis.");
        }
      }
    });
    return;
  }
});

// ✅ HELPER FUNCTIONS

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
    console.error("Redis SET error:", code, e);
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
          pending.push(saveCode(line).then((added) => added && count++));
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
  await Promise.all(lines.map(line => {
    const code = line.toLowerCase().trim();
    if (isValidCode(code)) {
      return saveCode(code).then((added) => added && count++);
    }
  }));
  return count;
}

async function insertFromJSON(path) {
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    await Promise.all(codes.map(code => {
      const val = typeof code === "string" ? code.toLowerCase().trim() : "";
      if (isValidCode(val)) {
        return saveCode(val).then((added) => added && count++);
      }
    }));
  } catch {
    console.error("Invalid JSON file");
  }
  return count;
}

console.log("🤖 Telegram bot running and ready.");
