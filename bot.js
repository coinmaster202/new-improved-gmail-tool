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
  return fs.readFileSync(CODE_FILE, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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

  // 📦 /view remaining
  if (text === "/view") {
    const all = readCodes();
    const grouped = validPrefixes.map(p => `${p}: ${all.filter(c => c.startsWith(p)).length}`).join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${grouped}`);
    return;
  }

  // ➕ /add codes
  if (text.startsWith("/add")) {
    const codes = text.split("\n").slice(1).map(l => l.trim()).filter(isValidCode);
    if (!codes.length) return bot.sendMessage(chatId, "❌ Invalid format. Use:\n/add\nv200-123456");

    const existing = new Set(readCodes());
    const newOnes = codes.filter(c => !existing.has(c));
    if (newOnes.length) {
      fs.appendFileSync(CODE_FILE, "\n" + newOnes.join("\n"));
    }

    bot.sendMessage(chatId, `✅ Added ${newOnes.length} codes.`);
    return;
  }

  // 🎟️ /code <mode>
  if (text.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1]?.toLowerCase();

    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
      return;
    }

    try {
      const used = new Set();
      const scan = redis.scanIterator({ match: `${mode}-*`, count: 100 });
      for await (const k of scan) used.add(k);

      let all = readCodes();
      const unused = all.filter(code => code.startsWith(mode) && !used.has(code));

      if (!unused.length) {
        bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
        return;
      }

      const selected = unused[Math.floor(Math.random() * unused.length)];
      await redis.set(selected, true);

      all = all.filter(c => c !== selected);
      writeCodes(all);

      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (e) {
      console.error("Redis error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }

    return;
  }
});

console.log("🤖 Telegram bot is running.");