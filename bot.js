import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import csvParser from "csv-parser";
import fs from "fs";
import https from "https";

// 🚨 Replace with your environment variable if not using Railway ENV directly
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const allowedUsers = [6630390831]; // Replace with your actual Telegram user ID
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const clearConfirmations = new Set();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.document) {
    const fileName = msg.document.file_name;
    const fileId = msg.document.file_id;
    const ext = fileName.split(".").pop();

    if (!["csv", "txt", "json"].includes(ext)) {
      return bot.sendMessage(chatId, "⚠️ Only CSV, TXT, or JSON files are supported.");
    }

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}.${ext}`;
    const fileStream = fs.createWriteStream(tempPath);

    https.get(fileUrl, (res) => {
      res.pipe(fileStream);
      fileStream.on("finish", async () => {
        fileStream.close();

        let inserted = 0;
        if (ext === "csv") {
          inserted = await insertFromCSV(tempPath);
        } else if (ext === "txt") {
          inserted = await insertFromTXT(tempPath);
        } else if (ext === "json") {
          inserted = await insertFromJSON(tempPath);
        }

        fs.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ Upload complete: ${inserted} valid codes added.`);
      });
    });
  }
});

// 🧹 /clear command with confirmation
bot.onText(/\/clear/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!allowedUsers.includes(userId)) {
    return bot.sendMessage(chatId, "⛔ You are not authorized to perform this action.");
  }

  if (clearConfirmations.has(userId)) {
    let deleted = 0;
    for (const prefix of validPrefixes) {
      const keys = await redis.keys(`${prefix}-*`);
      for (const key of keys) {
        await redis.del(key);
        deleted++;
      }
    }
    clearConfirmations.delete(userId);
    return bot.sendMessage(chatId, `🗑️ Deleted ${deleted} unlock codes.`);
  } else {
    clearConfirmations.add(userId);
    return bot.sendMessage(chatId, "⚠️ Confirm deletion by sending /clear again.");
  }
});

// 📦 File processors
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
    const code = line.toLowerCase().trim();
    if (await isValidCode(code)) {
      await redis.set(code, true);
      count++;
    }
  }
  return count;
}

async function insertFromJSON(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let count = 0;
  const codes = Array.isArray(content) ? content : Object.values(content);
  for (const raw of codes) {
    const code = raw.toLowerCase().trim();
    if (await isValidCode(code)) {
      await redis.set(code, true);
      count++;
    }
  }
  return count;
}

// 🔍 Code validator
async function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  if (!validPrefixes.includes(prefix) || suffix?.length !== 6) return false;
  const exists = await redis.get(code);
  return !exists;
}
