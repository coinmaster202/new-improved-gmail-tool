import TelegramBot from "node-telegram-bot-api"; import { Redis } from "@upstash/redis"; import fs from "fs"; import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, });

const CODE_FILE_PATH = path.join("./code.txt"); const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim().toLowerCase();

// ✅ View available codes if (text === "/view") { try { const lines = fs.readFileSync(CODE_FILE_PATH, "utf8").split(/\r?\n/).filter(Boolean); if (!lines.length) return bot.sendMessage(chatId, "📂 code.txt is empty."); const grouped = validPrefixes.map(p => ${p}: ${lines.filter(line => line.startsWith(p)).length}).join("\n"); bot.sendMessage(chatId, 📋 Available codes:\n${grouped}); } catch { bot.sendMessage(chatId, "❌ Failed to read code.txt."); } return; }

// ✅ Upload codes by file if (msg.document) { const fileId = msg.document.file_id; const file = await bot.getFile(fileId); const url = https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path};

try {
  const res = await fetch(url);
  const newCodes = (await res.text()).split(/\r?\n/).map(c => c.trim()).filter(Boolean);
  const existing = fs.existsSync(CODE_FILE_PATH)
    ? fs.readFileSync(CODE_FILE_PATH, "utf8").split(/\r?\n/).map(l => l.trim())
    : [];

  const merged = [...new Set([...existing, ...newCodes])];
  fs.writeFileSync(CODE_FILE_PATH, merged.join("\n"));
  bot.sendMessage(chatId, `✅ Added ${merged.length - existing.length} new codes.`);
} catch (e) {
  bot.sendMessage(chatId, "❌ Upload failed.");
}
return;

}

// ✅ Dispense code if (text?.startsWith("/code")) { const mode = text.split(" ")[1]; if (!validPrefixes.includes(mode)) return bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000...)");

try {
  const codes = fs.readFileSync(CODE_FILE_PATH, "utf8").split(/\r?\n/).map(c => c.trim()).filter(Boolean);
  const unused = codes.filter(code => code.startsWith(mode));
  if (!unused.length) return bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);

  const selected = unused[Math.floor(Math.random() * unused.length)];
  await redis.set(selected, true);

  // Remove from code.txt
  const remaining = codes.filter(line => line !== selected);
  fs.writeFileSync(CODE_FILE_PATH, remaining.join("\n"));

  bot.sendMessage(chatId, `🎟️ Your unlock code: ${selected}`);
} catch (e) {
  console.error("Redis error:", e);
  bot.sendMessage(chatId, "❌ Failed to pull code from Redis.");
}
return;

}

// ✅ Redis test if (text === "/ping") { try { await redis.set("test-key", "ok", { ex: 5 }); const result = await redis.get("test-key"); bot.sendMessage(chatId, result === "ok" ? "✅ Redis is online." : "❌ Redis error."); } catch { bot.sendMessage(chatId, "❌ Redis unreachable."); } return; }

// ✅ Clear Redis if (text === "/clear-all") { bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes."); bot.once("message", async (m) => { if (m.text === "/confirm" && m.chat.id === chatId) { try { let deleted = 0; for (const prefix of validPrefixes) { const iter = redis.scanIterator({ match: ${prefix}-*, count: 100 }); for await (const key of iter) { await redis.del(key); deleted++; } } bot.sendMessage(chatId, 🧹 Deleted ${deleted} used Redis codes.); } catch (e) { bot.sendMessage(chatId, "❌ Failed to clear Redis."); } } }); } });

console.log("🤖 Telegram bot fully initialized");

