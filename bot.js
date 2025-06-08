import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

// Env
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE = path.join("code.txt");
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function readCodes() {
  if (!fs.existsSync(CODE_FILE)) return [];
  return fs.readFileSync(CODE_FILE, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && /^[a-z]+\-\w{6,}$/.test(l));
}

function writeCodes(codes) {
  fs.writeFileSync(CODE_FILE, codes.join("\n") + "\n");
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text) return;

  // 🟢 /ping
  if (text === "/ping") {
    try {
      await redis.set("test", "ok", { ex: 5 });
      const res = await redis.get("test");
      bot.sendMessage(chatId, res === "ok" ? "✅ Redis is online." : "❌ Redis check failed.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis error.");
    }
    return;
  }

  // 📦 /view
  if (text === "/view") {
    const all = readCodes();
    const count = validPrefixes.map(p => {
      const c = all.filter(x => x.startsWith(p)).length;
      return `${p}: ${c}`;
    }).join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${count}`);
    return;
  }

  // ➕ /add vXXX-xxxxxx
  if (text.startsWith("/add")) {
    const code = text.split(" ")[1]?.toLowerCase();
    const [prefix, suffix] = code?.split("-") || [];

    if (!validPrefixes.includes(prefix) || !/^\w{6,}$/.test(suffix)) {
      bot.sendMessage(chatId, "❌ Invalid format. Use: /add v200-123456");
      return;
    }

    const current = readCodes();
    if (current.includes(code)) {
      bot.sendMessage(chatId, "⚠️ Code already exists.");
      return;
    }

    current.push(code);
    writeCodes(current);
    bot.sendMessage(chatId, `✅ Code ${code} added.`);
    return;
  }

  // 🧹 /clear
  if (text === "/clear") {
    let deleted = 0;
    for (const prefix of validPrefixes) {
      const keys = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
      for await (const key of keys) {
        await redis.del(key);
        deleted++;
      }
    }
    bot.sendMessage(chatId, `🧹 Cleared ${deleted} used Redis keys.`);
    return;
  }

  // 🎟️ /code vXXX
  if (text.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)");
      return;
    }

    try {
      const codes = readCodes();
      const available = [];

      for (const code of codes) {
        if (code.startsWith(mode)) {
          const used = await redis.get(code);
          if (!used) available.push(code);
        }
      }

      if (available.length === 0) {
        bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
        return;
      }

      const selected = available[Math.floor(Math.random() * available.length)];
      await redis.set(selected, true);
      const updated = codes.filter(c => c !== selected);
      writeCodes(updated);
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (err) {
      console.error("Pull error:", err);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }
    return;
  }
});

console.log("🤖 Telegram bot ready");