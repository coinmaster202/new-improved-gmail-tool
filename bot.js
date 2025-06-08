import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// 🔐 ENV Setup
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // 📂 Handle uploads
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
          bot.sendMessage(chatId, "❌ Unsupported format. Use TXT, CSV or JSON.");
          fs.unlinkSync(tempPath);
          return;
        }
        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Uploaded ${count} codes.`);
      });
    });
    return;
  }

  // 🔄 /ping check
  if (msg.text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const test = await redis.get("test-key");
      bot.sendMessage(chatId, test === "ok" ? "✅ Redis is online." : "❌ Redis check failed.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // 🎟️ /code v200
  if (msg.text?.startsWith("/code")) {
    const args = msg.text.trim().split(" ");
    const mode = args[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)");
      return;
    }

    try {
      const keys = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      for await (const key of keys) {
        const exists = await redis.get(key);
        if (exists) {
          await redis.del(key);
          bot.sendMessage(chatId, `🎟️ Your unlock code: ${key}`);
          return;
        }
      }
      bot.sendMessage(chatId, "❌ No valid codes found.");
    } catch (e) {
      console.error("Fetch error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
    }
    return;
  }

  // 🧹 /clear-all + /confirm-clear
  if (msg.text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm-clear in 10s to delete ALL codes.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm-clear" && m.chat.id === chatId) {
        let deleted = 0;
        for (const prefix of validPrefixes) {
          const scan = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
          for await (const key of scan) {
            await redis.del(key);
            deleted++;
          }
        }
        bot.sendMessage(chatId, `✅ Deleted ${deleted} codes from Redis.`);
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }
});

// 📥 Import helpers
function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/.test(suffix);
}
async function saveCode(code) {
  try {
    if (!(await redis.get(code))) {
      await redis.set(code, true);
      return true;
    }
  } catch (e) {
    console.error("Redis SET error:", code, e);
  }
  return false;
}
async function insertFromText(path) {
  let count = 0;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  await Promise.all(lines.map(line => {
    const code = line.toLowerCase().trim();
    return isValidCode(code) && saveCode(code).then((added) => added && count++);
  }));
  return count;
}
async function insertFromCSV(path) {
  return new Promise((resolve) => {
    let count = 0;
    const pending = [];
    fs.createReadStream(path)
      .pipe(csvParser({ headers: false }))
      .on("data", (row) => {
        const code = Object.values(row).join(",").toLowerCase().trim();
        if (isValidCode(code)) {
          pending.push(saveCode(code).then((added) => added && count++));
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
    await Promise.all(codes.map(c => {
      const code = typeof c === "string" ? c.toLowerCase().trim() : "";
      return isValidCode(code) && saveCode(code).then((added) => added && count++);
    }));
  } catch {
    console.error("Invalid JSON format");
  }
  return count;
}

console.log("🤖 Telegram bot is online");