// ✅ Full working bot.js that reads codes from code.txt, deletes used ones from the file, // allows adding new codes via Telegram (/add), viewing remaining (/view), and pulls them properly.

import TelegramBot from "node-telegram-bot-api"; import { Redis } from "@upstash/redis"; import fs from "fs"; import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, });

const CODE_FILE_PATH = path.join("code.txt"); const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function getCodesFromFile() { if (!fs.existsSync(CODE_FILE_PATH)) return []; return fs.readFileSync(CODE_FILE_PATH, "utf8") .split(/\r?\n/) .map((line) => line.trim()) .filter(Boolean); }

function saveCodesToFile(codes) { fs.writeFileSync(CODE_FILE_PATH, codes.join("\n"), "utf8"); }

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim();

if (!text) return;

// ✅ /view command: show count per prefix if (text === "/view") { const codes = getCodesFromFile(); const counts = {}; for (const prefix of validPrefixes) { counts[prefix] = codes.filter((c) => c.startsWith(prefix)).length; } const message = "📦 Remaining Codes:\n" + validPrefixes.map((p) => ${p}: ${counts[p] || 0}).join("\n"); bot.sendMessage(chatId, message); return; }

// ✅ /add command if (text.startsWith("/add")) { const input = text.slice(4).trim(); const lines = input.split(/,|\n/).map((line) => line.trim()).filter(Boolean); const validCodes = lines.filter( (c) => validPrefixes.some((p) => c.startsWith(p)) && /^\w+-\d{6}$/.test(c) );

const existing = new Set(getCodesFromFile());
const fresh = validCodes.filter((c) => !existing.has(c));
if (fresh.length) {
  const updated = [...existing, ...fresh];
  saveCodesToFile(updated);
}
bot.sendMessage(chatId, `✅ Added ${fresh.length} new codes.`);
return;

}

// ✅ /code <mode> command if (text.startsWith("/code")) { const parts = text.split(" "); const mode = parts[1]?.trim().toLowerCase();

if (!validPrefixes.includes(mode)) {
  bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
  return;
}

const codes = getCodesFromFile();
const available = codes.filter((c) => c.startsWith(mode));

if (available.length === 0) {
  bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
  return;
}

const selected = available[Math.floor(Math.random() * available.length)];
await redis.set(selected, true);

const remaining = codes.filter((c) => c !== selected);
saveCodesToFile(remaining);

bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
return;

}

// ✅ /clear-all command if (text === "/clear-all") { bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes."); bot.once("message", async (m) => { if (m.text?.trim() === "/confirm" && m.chat.id === chatId) { let deleted = 0; try { for (const prefix of validPrefixes) { const iter = redis.scanIterator({ match: ${prefix}-*, count: 100 }); for await (const key of iter) { await redis.del(key); deleted++; } } bot.sendMessage(chatId, ✅ Deleted ${deleted} used codes from Redis.); } catch (e) { console.error("❌ Redis clear error:", e); bot.sendMessage(chatId, "❌ Failed to clear Redis."); } } else { bot.sendMessage(chatId, "❌ Clear cancelled."); } }); return; }

if (text === "/ping") { try { await redis.set("test-key", "ok", { ex: 5 }); const result = await redis.get("test-key"); bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis error."); } catch { bot.sendMessage(chatId, "❌ Redis unreachable."); } return; } });

console.log("🤖 Telegram bot initialized.");

