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

// Telegram Handler
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
    const counts = validPrefixes.map(p => {
      const count = codes.filter(c => c.startsWith(p)).length;
      return `${p}: ${count}`;
    }).join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${counts}`);
    return;
  }

  // /add code1 code2 ...
  if (text.startsWith("/add")) {
    const newCodes = text.split(" ").slice(1).map(c => c.toLowerCase()).filter(isValidCode);
    if (!newCodes.length) {
      bot.sendMessage(chatId, "❌ No valid codes found to add.");
      return;
    }
    const current = new Set(readCodes());
    for (const code of newCodes) current.add(code);
    writeCodes(Array.from(current));
    bot.sendMessage(chatId, `✅ Added ${newCodes.length} codes to code.txt.`);
    return;
  }

  // /code <mode>
  if (text.startsWith("/code")) {
    const parts = text.split(" ");
    const mode = parts[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)");
      return;
    }

    try {
      const all = readCodes();
      const filtered = all.filter(code => code.startsWith(mode));

      for (const code of filtered) {
        const inRedis = await redis.get(code);
        if (!inRedis) {
          await redis.set(code, true); // mark used
          const updated = all.filter(c => c !== code);
          writeCodes(updated); // remove from file
          bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
          return;
        }
      }

      bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
    } catch (e) {
      console.error("❌ Pull code error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }
    return;
  }
});

console.log("🤖 Bot ready: /code /add /view /ping");