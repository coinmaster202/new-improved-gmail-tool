
import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// ENV
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

// ✅ File Upload
async function handleFileUpload(msg, chatId) {
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
      bot.sendMessage(chatId, `✅ Uploaded ${count} codes.`);
    });
  });
}

// ✅ Main listener
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Upload
  if (msg.document) return handleFileUpload(msg, chatId);

  const text = msg.text?.trim().toLowerCase();
  if (!text) return;

  if (text === "/ping") {
    try {
      await redis.set("test", "ok", { ex: 5 });
      const test = await redis.get("test");
      bot.sendMessage(chatId, test === "ok" ? "✅ Redis is online." : "❌ Redis error.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis connection failed.");
    }
    return;
  }

  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm-clear in 10s to delete ALL codes.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm-clear" && m.chat.id === chatId) {
        let deleted = 0;
        for (const prefix of validPrefixes) {
          const keys = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
          for await (const key of keys) {
            await redis.del(key);
            deleted++;
          }
        }
        bot.sendMessage(chatId, `✅ Deleted ${deleted} codes.`);
      } else {
        bot.sendMessage(chatId, "❌ Deletion cancelled.");
      }
    });
    return;
  }

  if (text.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1];
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)");
      return;
    }

    try {
      const keys = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      const usable = [];
      for await (const key of keys) {
        const val = await redis.get(key);
        if (val) usable.push(key);
      }

      if (!usable.length) return bot.sendMessage(chatId, "❌ No valid codes left.");

      const selected = usable[Math.floor(Math.random() * usable.length)];
      await redis.del(selected);
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (e) {
      console.error("Code error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
    }
    return;
  }
});

// ✅ Import helpers
function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/.test(suffix);
}

async function saveCode(code) {
  const exists = await redis.get(code);
  if (!exists) {
    await redis.set(code, true);
    return true;
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

async function insertFromText(path) {
  let count = 0;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  await Promise.all(lines.map(line => {
    const code = line.toLowerCase().trim();
    return isValidCode(code) ? saveCode(code).then(a => a && count++) : null;
  }));
  return count;
}

async function insertFromJSON(path) {
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    await Promise.all(codes.map(code => {
      const c = typeof code === "string" ? code.toLowerCase().trim() : "";
      return isValidCode(c) ? saveCode(c).then(a => a && count++) : null;
    }));
  } catch {
    console.error("❌ JSON import failed");
  }
  return count;
}

console.log("🤖 Telegram bot online");