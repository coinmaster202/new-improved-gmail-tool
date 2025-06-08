import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CODE_FILE = path.join(process.cwd(), "code.txt");
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// 📥 Load all codes from code.txt
function loadCodes() {
  if (!fs.existsSync(CODE_FILE)) return [];
  return fs
    .readFileSync(CODE_FILE, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

// 💾 Save codes back to code.txt
function saveCodes(codes) {
  fs.writeFileSync(CODE_FILE, codes.join("\n") + "\n", "utf8");
}

// ➕ Add new codes
function addCodes(newCodes) {
  const current = new Set(loadCodes());
  let added = 0;
  for (const code of newCodes) {
    if (
      typeof code === "string" &&
      /^[a-z0-9]+-\d{6}$/i.test(code) &&
      !current.has(code)
    ) {
      current.add(code);
      added++;
    }
  }
  saveCodes([...current]);
  return added;
}

// 🎯 Dispense one code
async function getCode(mode) {
  const all = loadCodes();
  const available = all.filter(code => code.startsWith(mode + "-"));
  for (const code of available) {
    const used = await redis.get(code);
    if (!used) {
      await redis.set(code, true);
      saveCodes(all.filter(c => c !== code)); // remove from file
      return code;
    }
  }
  return null;
}

// 🤖 Bot commands
bot.on("message", async msg => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (text === "/ping") {
    try {
      await redis.set("ping-test", "ok", { ex: 5 });
      const res = await redis.get("ping-test");
      bot.sendMessage(chatId, res === "ok" ? "✅ Redis is online." : "❌ Redis error.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis failed.");
    }
    return;
  }

  if (text === "/view") {
    const all = loadCodes();
    const counts = {};
    for (const prefix of validPrefixes) {
      counts[prefix] = all.filter(c => c.startsWith(prefix + "-")).length;
    }
    const summary = Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    bot.sendMessage(chatId, `📦 Remaining Codes:\n${summary}`);
    return;
  }

  if (text?.startsWith("/code ")) {
    const mode = text.split(" ")[1].toLowerCase();
    if (!validPrefixes.includes(mode)) {
      bot.sendMessage(chatId, "❌ Usage: /code v200 (or v500, v1000, etc)");
      return;
    }
    const code = await getCode(mode);
    if (!code) {
      bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
    } else {
      bot.sendMessage(chatId, `🎟️ Your unlock code: ${code}`);
    }
    return;
  }

  if (text?.startsWith("/add")) {
    const pasted = text.replace("/add", "").trim();
    const lines = pasted.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const added = addCodes(lines);
    bot.sendMessage(chatId, `✅ Added ${added} new codes.`);
    return;
  }
});

console.log("🤖 Telegram bot ready!");