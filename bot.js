import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE_PATH = path.join("code.txt");
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^\d{6}$/.test(suffix);
}

function readCodes() {
  return fs.existsSync(CODE_FILE_PATH)
    ? fs.readFileSync(CODE_FILE_PATH, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    : [];
}

function writeCodes(codes) {
  fs.writeFileSync(CODE_FILE_PATH, codes.join("\n"));
}

// Handle Telegram messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // /ping
  if (text === "/ping") {
    try {
      await redis.set("test-ping", "ok", { ex: 5 });
      const result = await redis.get("test-ping");
      bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis error.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // /view
  if (text === "/view") {
    const codes = readCodes();
    const countPerPrefix = validPrefixes.map(prefix => {
      const count = codes.filter(c => c.startsWith(prefix)).length;
      return `${prefix}: ${count}`;
    }).join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${countPerPrefix}`);
    return;
  }

  // /add <code1> <code2> ...
  if (text?.startsWith("/add")) {
    const parts = text.split(" ").slice(1);
    const newCodes = parts.map(c => c.toLowerCase()).filter(isValidCode);

    if (newCodes.length === 0) {
      bot.sendMessage(chatId, "❌ No valid codes found to add.");
      return;
    }

    const existing = new Set(readCodes());
    const combined = Array.from(new Set([...existing, ...newCodes]));
    writeCodes(combined);

    bot.sendMessage(chatId, `✅ Added ${newCodes.length} codes to code.txt.`);
    return;
  }

  // /code <mode>
  if (text?.startsWith("/code")) {
    const args = text.split(" ");
    const mode = args[1]?.toLowerCase();

    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
      return;
    }

    try {
      const used = new Set();
      const iter = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      for await (const key of iter) used.add(key);

      const codes = readCodes();
      const available = codes.filter(code => code.startsWith(mode) && !used.has(code));

      if (available.length === 0) {
        bot.sendMessage(chatId, `❌ No unused ${mode} codes available.`);
        return;
      }

      const chosen = available[Math.floor(Math.random() * available.length)];
      await redis.set(chosen, true); // Mark as used
      writeCodes(codes.filter(code => code !== chosen)); // Remove from file

      bot.sendMessage(chatId, `🎟️ Your unlock code: ${chosen}`);
    } catch (e) {
      console.error("❌ Error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }
    return;
  }
});

console.log("🤖 Telegram bot ready with /code, /view, /add");