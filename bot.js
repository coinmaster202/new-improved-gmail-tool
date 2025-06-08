import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import csvParser from "csv-parser";

// Set your config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document) {
    bot.sendMessage(chatId, "📎 Please send a .csv, .txt, or .json file.");
    return;
  }

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
      let inserted = 0;

      if (fileName.endsWith(".csv")) {
        inserted = await insertCodesFromCSV(tempPath);
      } else if (fileName.endsWith(".txt")) {
        inserted = await insertCodesFromTXT(tempPath);
      } else if (fileName.endsWith(".json")) {
        inserted = await insertCodesFromJSON(tempPath);
      }

      fs.unlinkSync(tempPath);
      bot.sendMessage(chatId, `✅ Upload complete. ${inserted} valid codes added.`);
    });
  });
});

async function insertCodeIfValid(code) {
  code = code.toLowerCase().trim();
  const [prefix, suffix] = code.split("-");
  if (validPrefixes.includes(prefix) && suffix?.length === 6) {
    const exists = await redis.get(code);
    if (!exists) {
      await redis.set(code, true);
      return true;
    }
  }
  return false;
}

async function insertCodesFromCSV(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false }))
      .on("data", async (row) => {
        const code = Object.values(row)[0];
        if (await insertCodeIfValid(code)) count++;
      })
      .on("end", () => resolve(count));
  });
}

async function insertCodesFromTXT(filePath) {
  const content = fs.readFileSync(filePath, "utf8").split("\n");
  let count = 0;
  for (const line of content) {
    if (await insertCodeIfValid(line)) count++;
  }
  return count;
}

async function insertCodesFromJSON(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    let count = 0;
    for (const code of codes) {
      if (await insertCodeIfValid(code)) count++;
    }
    return count;
  } catch (e) {
    console.error("JSON parsing error:", e);
    return 0;
  }
}
