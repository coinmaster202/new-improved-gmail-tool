import TelegramBot from "node-telegram-bot-api";
import { Redis } from "@upstash/redis";
import fs from "fs/promises";
import https from "https";
import fss from "fs";
import csvParser from "csv-parser";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"];

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  // 📁 File uploads
  if (msg.document) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name.toLowerCase();
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const tempPath = `./temp-${Date.now()}-${fileName}`;
    const stream = fss.createWriteStream(tempPath);
    https.get(fileUrl, (res) => {
      res.pipe(stream);
      stream.on("finish", async () => {
        stream.close();
        let count = 0;
        if (fileName.endsWith(".csv")) count = await insertFromCSV(tempPath);
        else if (fileName.endsWith(".txt")) count = await insertFromText(tempPath);
        else if (fileName.endsWith(".json")) count = await insertFromJSON(tempPath);
        else {
          bot.sendMessage(chatId, "❌ Unsupported file format");
          fss.unlinkSync(tempPath);
          return;
        }
        fss.unlinkSync(tempPath);
        bot.sendMessage(chatId, `✅ ${count} codes saved to code.txt`);
      });
    });
    return;
  }

  // 🔓 /code v500
  if (text?.startsWith("/code")) {
    const args = text.split(" ");
    const mode = args[1]?.toLowerCase();
    if (!validPrefixes.includes(mode)) {
      return bot.sendMessage(chatId, "❌ Usage: /code v200 or v500 etc.");
    }

    try {
      const raw = await fs.readFile("code.txt", "utf8");
      const all = raw.split(/\r?\n/).map((x) => x.trim()).filter((x) => x.startsWith(mode + "-"));
      const available = [];
      for (const code of all) {
        const used = await redis.get(code);
        if (!used) available.push(code);
      }

      if (available.length === 0) {
        return bot.sendMessage(chatId, `❌ No unused ${mode} codes found.`);
      }

      const chosen = available[Math.floor(Math.random() * available.length)];
      await redis.set(chosen, true); // mark used
      return bot.sendMessage(chatId, `🎟️ Your unlock code: ${chosen}`);
    } catch (e) {
      console.error("Pull error:", e);
      return bot.sendMessage(chatId, "❌ Failed to read code.txt.");
    }
  }

  // ✅ /ping
  if (text === "/ping") {
    try {
      await redis.set("test-key", "ok", { ex: 5 });
      const check = await redis.get("test-key");
      bot.sendMessage(chatId, check === "ok" ? "✅ Redis is online." : "❌ Redis issue.");
    } catch {
      bot.sendMessage(chatId, "❌ Redis unreachable.");
    }
    return;
  }

  // 🧹 /clear-all
  if (text === "/clear-all") {
    bot.sendMessage(chatId, "⚠️ Type /confirm within 10 seconds to delete ALL used codes.");
    bot.once("message", async (m) => {
      if (m.text === "/confirm" && m.chat.id === chatId) {
        let deleted = 0;
        try {
          for (const prefix of validPrefixes) {
            const iter = redis.scanIterator({ match: `${prefix}-*`, count: 100 });
            for await (const key of iter) {
              await redis.del(key);
              deleted++;
            }
          }
          bot.sendMessage(chatId, `🧹 Cleared ${deleted} used codes from Redis.`);
        } catch (e) {
          bot.sendMessage(chatId, "❌ Failed to clear Redis.");
        }
      } else {
        bot.sendMessage(chatId, "❌ Clear cancelled.");
      }
    });
    return;
  }
});

// 🧩 Valid code check
function isValidCode(code) {
  const [prefix, suffix] = code.split("-");
  return validPrefixes.includes(prefix) && /^[a-z0-9]{6}$/i.test(suffix);
}

// 📥 Save helper
async function saveCode(code) {
  if (!isValidCode(code)) return false;
  const file = await fs.readFile("code.txt", "utf8").catch(() => "");
  if (!file.includes(code)) {
    await fs.appendFile("code.txt", code + "\n");
    return true;
  }
  return false;
}

// 📂 Importers
async function insertFromCSV(path) {
  return new Promise((resolve) => {
    let count = 0;
    const pending = [];
    fss.createReadStream(path)
      .pipe(csvParser({ headers: false }))
      .on("data", (row) => {
        const line = Object.values(row).join(",").toLowerCase().trim();
        pending.push(saveCode(line).then((ok) => ok && count++));
      })
      .on("end", async () => {
        await Promise.all(pending);
        resolve(count);
      });
  });
}

async function insertFromText(path) {
  const lines = fss.readFileSync(path, "utf8").split(/\r?\n/);
  let count = 0;
  await Promise.all(lines.map((line) =>
    saveCode(line.toLowerCase().trim()).then((ok) => ok && count++)
  ));
  return count;
}

async function insertFromJSON(path) {
  let count = 0;
  try {
    const data = JSON.parse(fss.readFileSync(path, "utf8"));
    const codes = Array.isArray(data) ? data : Object.values(data);
    await Promise.all(codes.map((item) => {
      const code = typeof item === "string" ? item.toLowerCase().trim() : "";
      return saveCode(code).then((ok) => ok && count++);
    }));
  } catch {
    console.error("Invalid JSON file.");
  }
  return count;
}

console.log("🤖 Telegram Bot using code.txt + Redis is live!");