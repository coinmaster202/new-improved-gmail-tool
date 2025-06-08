import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";
import csvParser from "csv-parser";

// Redis setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Telegram bot setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

let pendingClear = false;
let confirmTimeout = null;

// 📁 File upload handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_CHAT_ID) return;

  // If text command, ignore here
  if (!msg.document) return;

  const file = msg.document;
  const fileId = file.file_id;
  const fileName = file.file_name.toLowerCase();

  if (!fileName.endsWith(".csv") && !fileName.endsWith(".txt") && !fileName.endsWith(".json")) {
    bot.sendMessage(chatId, "❌ Unsupported file type. Send a .csv, .txt or .json file.");
    return;
  }

  const fileInfo = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
  const tempPath = `./upload-${Date.now()}-${fileName}`;
  const fileStream = fs.createWriteStream(tempPath);

  https.get(fileUrl, (res) => {
    res.pipe(fileStream);
    fileStream.on("finish", async () => {
      fileStream.close();

      let inserted = 0;
      if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        inserted = await insertFromTextOrCSV(tempPath);
      } else if (fileName.endsWith(".json")) {
        inserted = await insertFromJSON(tempPath);
      }

      fs.unlinkSync(tempPath);
      bot.sendMessage(chatId, `✅ Done! ${inserted} new codes added.`);
    });
  });
});

// ✅ Insert CSV or TXT (line-by-line codes)
async function insertFromTextOrCSV(path) {
  return new Promise((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(path).pipe(csvParser({ headers: false }));
    stream.on("data", async (row) => {
      const code = Object.values(row)[0]?.toLowerCase().trim();
      if (isValidCode(code)) {
        const exists = await redis.get(code);
        if (!exists) {
          await redis.set(code, true);
          count++;
        }
      }
    });
    stream.on("end", () => resolve(count));
  });
}

// ✅ Insert from JSON
async function insertFromJSON(path) {
  let count = 0;
  const content = fs.readFileSync(path, "utf8");
  try {
    const codes = JSON.parse(content);
    for (const code of codes) {
      if (isValidCode(code)) {
        const exists = await redis.get(code.toLowerCase());
        if (!exists) {
          await redis.set(code.toLowerCase(), true);
          count++;
        }
      }
    }
  } catch (err) {
    console.error("JSON Parse Error", err);
  }
  return count;
}

// ✅ Code format check
function isValidCode(code) {
  if (!code || !code.includes("-")) return false;
  const [prefix, suffix] = code.toLowerCase().split("-");
  return validPrefixes.includes(prefix) && suffix?.length === 6;
}

// ⚠️ /clear with confirmation
bot.onText(/\/clear/, (msg) => {
  if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
  pendingClear = true;
  bot.sendMessage(msg.chat.id, "⚠️ Are you sure you want to delete ALL unlock codes from Redis?\nReply with `/confirm` within 60 seconds to proceed.", { parse_mode: "Markdown" });

  confirmTimeout = setTimeout(() => {
    pendingClear = false;
  }, 60000);
});

bot.onText(/\/confirm/, async (msg) => {
  if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
  if (!pendingClear) {
    bot.sendMessage(msg.chat.id, "⚠️ Confirm deletion by sending /clear again.");
    return;
  }

  try {
    const keys = await redis.keys("*");
    const unlockKeys = keys.filter((k) =>
      validPrefixes.some((prefix) => k.toLowerCase().startsWith(prefix))
    );
    for (const key of unlockKeys) {
      await redis.del(key);
    }

    pendingClear = false;
    clearTimeout(confirmTimeout);
    bot.sendMessage(msg.chat.id, "✅ All unlock codes successfully cleared.");
  } catch (e) {
    console.error("Clear error:", e);
    bot.sendMessage(msg.chat.id, "❌ Failed to clear codes.");
  }
});

console.log("🤖 Telegram bot is running...");