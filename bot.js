
import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE_PATH = path.join(process.cwd(), "code.txt");
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  // 🔁 Ping
  if (text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const res = await redis.get("test-key");
      bot.sendMessage(chatId, res === "ok" ? "✅ Redis is online." : "❌ Redis error.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // 🎟️ /code <mode>
  if (text?.startsWith("/code")) {
    const mode = text.split(" ")[1];
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
      return;
    }

    try {
      const lines = fs.readFileSync(CODE_FILE_PATH, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith(mode));

      for (const code of lines) {
        const used = await redis.get(code);
        if (!used) {
          await redis.set(code, true); // Mark as used
          bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
          return;
        }
      }

      bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
    } catch (err) {
      console.error("Code read error:", err);
      bot.sendMessage(chatId, "❌ Failed to read from code.txt.");
    }
    return;
  }

  // 🧹 /clear-all + /confirm
  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes.");

    bot.once("message", async (m) => {
      if (m.text?.trim().toLowerCase() === "/confirm" && m.chat.id === chatId) {
        try {
          const lines = fs.readFileSync(CODE_FILE_PATH, "utf8")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => validPrefixes.some(p => line.startsWith(p)));

          let deleted = 0;
          for (const code of lines) {
            const exists = await redis.get(code);
            if (exists) {
              await redis.del(code);
              deleted++;
            }
          }

          bot.sendMessage(chatId, `✅ Cleared ${deleted} codes from Redis.`);
        } catch (err) {
          console.error("Clear error:", err);
          bot.sendMessage(chatId, "❌ Failed to clear Redis.");
        }
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }
});

console.log("🤖 Telegram bot is running and using code.txt");