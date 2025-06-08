// bot.js import TelegramBot from "node-telegram-bot-api"; import { Redis } from "@upstash/redis"; import fs from "fs"; import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, });

const CODE_FILE_PATH = path.join("./code.txt"); const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function readCodes() { if (!fs.existsSync(CODE_FILE_PATH)) return []; return fs.readFileSync(CODE_FILE_PATH, "utf8") .split(/\r?\n/) .map((l) => l.trim()) .filter(Boolean); }

function writeCodes(lines) { fs.writeFileSync(CODE_FILE_PATH, lines.join("\n"), "utf8"); }

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim().toLowerCase();

if (!text) return;

// /ping if (text === "/ping") { try { await redis.set("test-key", "ok", { ex: 5 }); const res = await redis.get("test-key"); bot.sendMessage(chatId, res === "ok" ? "✅ Redis is online." : "❌ Redis error."); } catch { bot.sendMessage(chatId, "❌ Redis unreachable."); } return; }

// /code <mode> if (text.startsWith("/code")) { const parts = text.split(" "); const mode = parts[1]?.toLowerCase(); if (!validPrefixes.includes(mode)) { bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)"); return; }

try {
  const all = readCodes();
  const filtered = all.filter((code) => code.startsWith(mode));

  for (const code of filtered) {
    const isUsed = await redis.get(code);
    if (!isUsed) {
      await redis.set(code, true);
      const updated = all.filter((c) => c !== code);
      writeCodes(updated);
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

// /view if (text === "/view") { const all = readCodes(); const counts = {}; for (const prefix of validPrefixes) { counts[prefix] = all.filter((c) => c.startsWith(prefix)).length; } const msgView = 📦 Remaining Codes:\n + validPrefixes.map((p) => ${p}: ${counts[p]}).join("\n"); bot.sendMessage(chatId, msgView); return; }

// /add <code> if (text.startsWith("/add")) { const parts = text.split(" "); const newCode = parts[1]; if (!newCode || !validPrefixes.some((p) => newCode.startsWith(p))) { bot.sendMessage(chatId, "❌ Invalid code format. Must start with v200, v500, etc."); return; } const all = readCodes(); if (!all.includes(newCode)) { all.push(newCode); writeCodes(all); bot.sendMessage(chatId, ✅ Code ${newCode} added.); } else { bot.sendMessage(chatId, "⚠️ Code already exists."); } return; }

// /clear-all + /confirm if (text === "/clear-all") { bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes."); bot.once("message", async (m) => { if (m.text?.trim().toLowerCase() === "/confirm" && m.chat.id === chatId) { let deleted = 0; try { for (const prefix of validPrefixes) { const iter = redis.scanIterator({ match: ${prefix}-*, count: 100 }); for await (const key of iter) { await redis.del(key); deleted++; } } bot.sendMessage(chatId, ✅ Deleted ${deleted} used codes from Redis.); } catch (e) { console.error("❌ Redis clear error:", e); bot.sendMessage(chatId, "❌ Failed to clear Redis."); } } else { bot.sendMessage(chatId, "❌ Clear cancelled."); } }); return; } });

console.log("🤖 Telegram bot initialized.");

