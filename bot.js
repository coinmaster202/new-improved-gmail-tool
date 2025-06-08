// bot.js
import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE_PATH = path.join(process.cwd(), "code.txt"); // ✅ Corrected
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  // /ping check
  if (text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const result = await redis.get("test-key");
      bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis error.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
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
      const usedKeys = new Set();
      for (const prefix of validPrefixes) {
        const iter = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
        for await (const key of iter) usedKeys.add(key);
      }

      const lines = fs.readFileSync(CODE_FILE_PATH, "utf8")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

      const unused = lines.filter(code => code.startsWith(mode) && !usedKeys.has(code));

      if (unused.length === 0) {
        bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
        return;
      }

      const selected = unused[Math.floor(Math.random() * unused.length)];
      await redis.set(selected, true); // Mark as used
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
    } catch (e) {
      console.error("❌ Code error:", e);
      bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
    }
    return;
  }

  // /clear-all and confirm
  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes.");

    bot.once("message", async (m) => {
      if (m.text?.trim().toLowerCase() === "/confirm" && m.chat.id === chatId) {
        let deleted = 0;
        try {
          for (const prefix of validPrefixes) {
            const iter = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
            for await (const key of iter) {
              await redis.del(key);
              deleted++;
            }
          }
          bot.sendMessage(chatId, `✅ Deleted ${deleted} used codes from Redis.`);
        } catch (e) {
          console.error("❌ Redis clear error:", e);
          bot.sendMessage(chatId, "❌ Failed to clear Redis.");
        }
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }
});

console.log("🤖 Telegram bot initialized.");