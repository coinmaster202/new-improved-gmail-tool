// ✅ Clean, fixed bot.js import TelegramBot from "node-telegram-bot-api"; import { Redis } from "@upstash/redis"; import https from "https"; import fs from "fs"; import csvParser from "csv-parser";

// Environment setup const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, });

const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim();

// Handle /ping if (text === "/ping") { try { await redis.set("test-key", "ok", { ex: 5 }); const result = await redis.get("test-key"); bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis failed."); } catch { bot.sendMessage(chatId, "❌ Redis unreachable."); } return; }

// Handle /code <mode> if (text?.startsWith("/code")) { const args = text.split(" "); const mode = args[1]?.toLowerCase();

if (!validPrefixes.includes(mode)) {
  bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
  return;
}

try {
  const keys = redis.scanIterator({ match: `${mode}-*`, count: 100 });
  const unused = [];

  for await (const key of keys) {
    const value = await redis.get(key);
    if (value) unused.push(key);
  }

  if (unused.length === 0) {
    bot.sendMessage(chatId, `❌ No codes left for mode ${mode}.`);
    return;
  }

  const code = unused[Math.floor(Math.random() * unused.length)];
  await redis.del(code);
  bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
} catch (err) {
  console.error("Redis fetch error:", err);
  bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
}
return;

}

// Handle file uploads if (msg.document) { const fileId = msg.document.file_id; const fileName = msg.document.file_name.toLowerCase(); const file = await bot.getFile(fileId); const fileUrl = https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}; const tempPath = ./temp-${Date.now()}-${fileName};

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
return;

}

// Handle clearing all keys if (text === "/clear-all") { bot.sendMessage(chatId, "⚠️ This will delete ALL codes. Type /confirm-clear within 10s to continue."); bot.once("message", async (m) => { if (m.text === "/confirm-clear" && m.chat.id === chatId) { let deleted = 0; try { for (const prefix of validPrefixes) { const keys = redis.scanIterator({ match: ${prefix}-* }); for await (const key of keys) { await redis.del(key); deleted++; } } bot.sendMessage(chatId, ✅ Deleted ${deleted} codes from Redis.); } catch (e) { bot.sendMessage(chatId, "❌ Failed to delete codes."); } } }); return; } });

// Code validation and saving function isValidCode(code) { const [prefix, suffix] = code.split("-"); return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/i.test(suffix); }

async function saveCode(code) { try { const exists = await redis.get(code); if (!exists) { await redis.set(code, true); return true; } } catch (e) { console.error("Redis set error for:", code); } return false; }

async function insertFromCSV(path) { return new Promise((resolve) => { let count = 0; const pending = []; fs.createReadStream(path) .pipe(csvParser({ headers: false })) .on("data", (row) => { const line = Object.values(row).join(",").toLowerCase().trim(); if (isValidCode(line)) { pending.push(saveCode(line).then((added) => added && count++)); } }) .on("end", async () => { await Promise.all(pending); resolve(count); }); }); }

async function insertFromText(path) { let count = 0; const lines = fs.readFileSync(path, "utf8").split(/\r?\n/); await Promise.all( lines.map((line) => { const code = line.toLowerCase().trim(); if (isValidCode(code)) { return saveCode(code).then((added) => added && count++); } }) ); return count; }

async function insertFromJSON(path) { let count = 0; try { const data = JSON.parse(fs.readFileSync(path, "utf8")); const codes = Array.isArray(data) ? data : Object.values(data); await Promise.all( codes.map((item) => { const code = typeof item === "string" ? item.toLowerCase().trim() : ""; if (isValidCode(code)) { return saveCode(code).then((added) => added && count++); } }) ); } catch { console.error("Invalid JSON"); } return count; }

console.log("🤖 Telegram bot is live and using real Redis keys only.");

