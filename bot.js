import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

// Environment setup
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE_PATH = "./code.txt"; // 📌 Assumes code.txt is in the root
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ✅ Utility: Read codes from file
function loadCodes() {
  if (!fs.existsSync(CODE_FILE_PATH)) return [];
  return fs.readFileSync(CODE_FILE_PATH, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

// ✅ Utility: Write all codes back to file
function saveCodes(codes) {
  fs.writeFileSync(CODE_FILE_PATH, codes.join("\n"));
}

// ✅ Utility: Is valid format
function isValidCode(code) {
  const [prefix, suffix] = code.toLowerCase().split("-");
  return validPrefixes.includes(prefix) && /^[0-9a-z]{6}$/.test(suffix);
}

// ✅ Telegram Commands
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // /ping
  if (text === "/ping") {
    try {
      await redis.set("test", "ok", { ex: 5 });
      const res = await redis.get("test");
      bot.sendMessage(chatId, res === "ok" ? "✅ Redis is online." : "❌ Redis issue.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // /code <mode>
  if (text?.startsWith("/code ")) {
    const mode = text.split(" ")[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200");
      return;
    }

    try {
      const used = new Set();
      for await (const key of redis.scanIterator({ match: `${mode}-*`, count: 100 })) {
        used.add(key);
      }

      const allCodes = loadCodes();
      const unused = allCodes.filter(c => c.startsWith(mode) && !used.has(c));

      if (!unused.length) {
        bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
        return;
      }

      const selected = unused[Math.floor(Math.random() * unused.length)];
      await redis.set(selected, true);
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (e) {
      console.error(e);
      bot.sendMessage(chatId, "❌ Failed to pull code.");
    }
    return;
  }

  // /view
  if (text === "/view") {
    const counts = { v200: 0, v500: 0, v1000: 0, v5000: 0, unlimt: 0 };
    const used = new Set();
    for (const prefix of validPrefixes) {
      for await (const key of redis.scanIterator({ match: `${prefix}-*`, count: 100 })) {
        used.add(key);
      }
    }

    const allCodes = loadCodes();
    for (const c of allCodes) {
      const prefix = c.split("-")[0];
      if (validPrefixes.includes(prefix) && !used.has(c)) {
        counts[prefix]++;
      }
    }

    const msgLines = Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${msgLines}`);
    return;
  }

  // /add v200-123456 \n v200-987654 ...
  if (text?.startsWith("/add")) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l && l !== "/add");
    const allCodes = loadCodes();
    const added = [];

    for (const c of lines) {
      if (isValidCode(c) && !allCodes.includes(c)) {
        allCodes.push(c);
        added.push(c);
      }
    }

    saveCodes(allCodes);
    bot.sendMessage(chatId, `✅ Added ${added.length} new codes.`);
    return;
  }

  // /clear-all and /confirm
  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes.");
    bot.once("message", async (m) => {
      if (m.text?.toLowerCase() === "/confirm" && m.chat.id === chatId) {
        let deleted = 0;
        try {
          for (const prefix of validPrefixes) {
            for await (const key of redis.scanIterator({ match: `${prefix}-*`, count: 100 })) {
              await redis.del(key);
              deleted++;
            }
          }
          bot.sendMessage(chatId, `✅ Deleted ${deleted} used Redis codes.`);
        } catch {
          bot.sendMessage(chatId, "❌ Failed to clear Redis.");
        }
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }
});

console.log("🤖 Telegram bot is running.");