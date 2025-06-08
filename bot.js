// bot.js import TelegramBot from "node-telegram-bot-api"; import { Redis } from "@upstash/redis"; import fs from "fs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, });

const CODE_FILE = "code.txt"; const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim();

if (!text) return;

// /ping if (text === "/ping") { try { await redis.set("test-key", "ok", { ex: 5 }); const result = await redis.get("test-key"); bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis error."); } catch { bot.sendMessage(chatId, "❌ Redis unreachable."); } return; }

// /view if (text === "/view") { const lines = fs.readFileSync(CODE_FILE, "utf8").split(/\r?\n/).filter(Boolean); const counts = Object.fromEntries(validPrefixes.map(p => [p, 0])); for (const line of lines) { const prefix = line.split("-")[0]; if (validPrefixes.includes(prefix)) counts[prefix]++; } const message = 🚚 Remaining Codes:\n + Object.entries(counts).map(([k, v]) => ${k}: ${v}).join("\n"); bot.sendMessage(chatId, message); return; }

// /code <prefix> if (text.startsWith("/code")) { const parts = text.split(" "); const prefix = parts[1]?.toLowerCase();

if (!validPrefixes.includes(prefix)) {
  bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
  return;
}

try {
  const lines = fs.readFileSync(CODE_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  const available = lines.filter(l => l.startsWith(prefix));
  if (available.length === 0) {
    bot.sendMessage(chatId, `❌ No unused ${prefix} codes found.`);
    return;
  }

  const code = available[0];
  const updated = lines.filter(l => l !== code);
  fs.writeFileSync(CODE_FILE, updated.join("\n"));
  await redis.set(code, true);
  bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
} catch (e) {
  console.error("Code pull error:", e);
  bot.sendMessage(chatId, "❌ Failed to pull code.");
}
return;

}

// /add multiline if (text.startsWith("/add")) { const rawLines = text.split("\n").slice(1).map(l => l.trim().toLowerCase()).filter(Boolean); let added = 0; const existing = fs.readFileSync(CODE_FILE, "utf8").split(/\r?\n/).filter(Boolean); const combined = new Set(existing);

for (const line of rawLines) {
  const [prefix, suffix] = line.split("-");
  if (validPrefixes.includes(prefix) && /^[0-9a-z]{6,}$/.test(suffix) && !combined.has(line)) {
    combined.add(line);
    added++;
  }
}

fs.writeFileSync(CODE_FILE, Array.from(combined).join("\n"));
bot.sendMessage(chatId, `✅ Added ${added} new codes.`);
return;

} });

console.log("🤖 Telegram bot running...");

