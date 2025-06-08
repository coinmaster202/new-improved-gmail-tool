import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// ENV variables (Railway project or .env)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
let clearPending = false;
let clearTimeout = null;

// 🧠 Listen for files
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.document) {
    const ext = msg.document.file_name.split('.').pop().toLowerCase();
    const fileId = msg.document.file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}.${ext}`;

    const fileStream = fs.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", async () => {
        fileStream.close();
        let added = 0;

        if (ext === "csv") {
          added = await handleCSV(tempPath);
        } else if (ext === "txt") {
          added = await handleText(tempPath);
        } else if (ext === "json") {
          added = await handleJSON(tempPath);
        }

        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Done! ${added} valid codes added.`);
      });
    });
  }
});

// 📦 CSV Upload
async function handleCSV(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser())
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

// 📄 TXT Upload
async function handleText(filePath) {
  const content = fs.readFileSync(filePath, "utf-8").split("\n");
  let count = 0;
  for (const line of content) {
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

// 🧾 JSON Upload
async function handleJSON(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let count = 0;
  for (const item of content) {
    const code = typeof item === "string" ? item : item.code;
    if (code && isValidCode(code.toLowerCase())) {
      const exists = await redis.get(code.toLowerCase());
      if (!exists) {
        await redis.set(code.toLowerCase(), true);
        count++;
      }
    }
  }
  return count;
}

// ✅ Code format check
function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && suffix?.length === 6;
}

// ⚠️ /clear logic
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  if (clearPending) {
    bot.sendMessage(chatId, "⚠️ Confirm deletion by sending /clear again.");
    return;
  }

  clearPending = true;
  bot.sendMessage(
    chatId,
    "⚠️ Are you sure you want to delete ALL unlock codes from Redis?\nReply with `/confirm` within 60 seconds to proceed.",
    { parse_mode: "Markdown" }
  );

  clearTimeout = setTimeout(() => {
    clearPending = false;
  }, 60000);
});

// ✅ /confirm logic
bot.onText(/\/confirm/, async (msg) => {
  const chatId = msg.chat.id;
  if (!clearPending) {
    bot.sendMessage(chatId, "⚠️ No pending clear request.");
    return;
  }

  try {
    const keys = await redis.keys("*");
    const filtered = keys.filter((k) => validPrefixes.some((p) => k.startsWith(p)));
    await Promise.all(filtered.map((k) => redis.del(k)));
    clearPending = false;
    clearTimeout && clearTimeout(clearTimeout);
    bot.sendMessage(chatId, `✅ ${filtered.length} codes cleared from Redis.`);
  } catch (err) {
    console.error("Clear failed:", err);
    bot.sendMessage(chatId, "❌ Failed to clear codes.");
  }
});

// 🔁 Redis Ping
bot.onText(/\/ping/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await redis.set("test_ping", "ok");
    const result = await redis.get("test_ping");
    await redis.del("test_ping");
    bot.sendMessage(chatId, `🟢 Redis responded: ${result}`);
  } catch (err) {
    bot.sendMessage(chatId, "🔴 Redis error.");
  }
});