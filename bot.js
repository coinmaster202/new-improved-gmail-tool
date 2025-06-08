import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import csvParser from "csv-parser";
import fs from "fs";
import https from "https";

// === Configuration ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const allowedUsers = [6630390831]; // Replace with your Telegram user ID
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const confirmMap = new Map(); // userId => timestamp

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// === File Upload Handling ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Handle file uploads
  if (msg.document) {
    const fileName = msg.document.file_name;
    const fileId = msg.document.file_id;
    const ext = fileName.split(".").pop();

    if (!["csv", "txt", "json"].includes(ext)) {
      return bot.sendMessage(chatId, "⚠️ Only .csv, .txt, or .json files are supported.");
    }

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}.${ext}`;

    const stream = fs.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(stream);
      stream.on("finish", async () => {
        stream.close();
        let inserted = 0;

        if (ext === "csv") inserted = await insertFromCSV(tempPath);
        else if (ext === "txt") inserted = await insertFromTXT(tempPath);
        else if (ext === "json") inserted = await insertFromJSON(tempPath);

        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Done! ${inserted} valid codes added.`);
      });
    });
  }
});

// === /clear command ===
bot.onText(/\/clear/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!allowedUsers.includes(userId)) {
    return bot.sendMessage(chatId, "⛔ You are not authorized to clear codes.");
  }

  confirmMap.set(userId, Date.now());
  bot.sendMessage(chatId, "⚠️ Are you sure you want to delete ALL unlock codes from Redis?\nReply with `/confirm` within 60 seconds to proceed.");
});

// === /confirm command ===
bot.onText(/\/confirm/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const timestamp = confirmMap.get(userId);

  if (!timestamp || Date.now() - timestamp > 60000) {
    return bot.sendMessage(chatId, "❌ Confirmation expired or not initiated. Send /clear again.");
  }

  confirmMap.delete(userId);
  try {
    let deleted = 0;
    for (const prefix of validPrefixes) {
      const keys = await redis.keys(`${prefix}-*`);
      for (const key of keys) {
        await redis.del(key);
        deleted++;
      }
    }
    bot.sendMessage(chatId, `🧹 Success! ${deleted} codes were deleted.`);
  } catch (err) {
    console.error("Redis deletion error:", err);
    bot.sendMessage(chatId, "❌ Failed to clear codes.");
  }
});

// === Code Validators ===
async function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  if (!validPrefixes.includes(prefix) || !suffix || suffix.length !== 6) return false;
  const exists = await redis.get(code);
  return !exists;
}

// === Insert from file formats ===
async function insertFromCSV(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const code = Object.values(row)[0]?.toLowerCase().trim();
        if (await isValidCode(code)) {
          await redis.set(code, true);
          count++;
        }
      })
      .on("end", () => resolve(count));
  });
}

async function insertFromTXT(filePath) {
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const code = line.trim().toLowerCase();
    if (await isValidCode(code)) {
      await redis.set(code, true);
      count++;
    }
  }
  return count;
}

async function insertFromJSON(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const codes = Array.isArray(json) ? json : Object.values(json);
  let count = 0;
  for (const raw of codes) {
    const code = raw?.toString().trim().toLowerCase();
    if (await isValidCode(code)) {
      await redis.set(code, true);
      count++;
    }
  }
  return count;
}