import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE = path.resolve("code.txt");
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function readCodes() {
  if (!fs.existsSync(CODE_FILE)) return [];
  return fs.readFileSync(CODE_FILE, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

function writeCodes(codes) {
  fs.writeFileSync(CODE_FILE, codes.join("\n"), "utf8");
}

function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/i.test(suffix);
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text) return;

  // ✅ View remaining
  if (text === "/view") {
    const codes = readCodes();
    const countByPrefix = validPrefixes.map(p => `${p}: ${codes.filter(c => c.startsWith(p)).length}`).join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${countByPrefix}`);
    return;
  }

  // ✅ Add codes (bulk multi-line)
  if (text.startsWith("/add")) {
    const lines = text.split("\n").slice(1);
    const newCodes = lines.map(l => l.trim()).filter(isValidCode);

    if (newCodes.length === 0) {
      return bot.sendMessage(chatId, "❌ Invalid format. Use:\n/add\nv200-xxxxxx\nv500-xxxxxx");
    }

    const existing = new Set(readCodes());
    const filtered = newCodes.filter(code => !existing.has(code));

    if (filtered.length > 0) {
      fs.appendFileSync(CODE_FILE, "\n" + filtered.join("\n"));
    }

    bot.sendMessage(chatId, `✅ Added ${filtered.length} new codes.`);
    return;
  }

  // ✅ Generate code
  if (text.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1]?.toLowerCase();

    if (!validPrefixes.includes(mode)) {
      return bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
    }

    try {
      const used = new Set();
      const scan = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      for await (const key of scan) used.add(key);

      const all = readCodes();
      const available = all.filter(code => code.startsWith(mode) && !used.has(code));

      if (available.length === 0) {
        return bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
      }

      const selected = available[Math.floor(Math.random() * available.length)];
      await redis.set(selected, true);

      // Remove used code from file
      const updated = all.filter(c => c !== selected);
      writeCodes(updated);

      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }

    return;
  }
});

console.log("🤖 Telegram Bot Running");