import TelegramBot from "node-telegram-bot-api"; import fs from "fs"; import path from "path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const CODE_FILE_PATH = path.join("code.txt"); const validPrefixes = ["v200", "v500", "v1000", "v5000", "unlimt"]; const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function getCodeLines() { if (!fs.existsSync(CODE_FILE_PATH)) return []; return fs.readFileSync(CODE_FILE_PATH, "utf8") .split(/\r?\n/) .map(line => line.trim()) .filter(Boolean); }

function saveCodes(lines) { fs.writeFileSync(CODE_FILE_PATH, lines.join("\n")); }

bot.on("message", async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim();

// View remaining codes if (text === "/view") { const codes = getCodeLines(); const counts = {}; for (const prefix of validPrefixes) { counts[prefix] = codes.filter(code => code.startsWith(prefix)).length; } const message = 📦 Remaining Codes:\n + validPrefixes.map(p => ${p}: ${counts[p]}).join("\n"); bot.sendMessage(chatId, message); return; }

// Dispense code if (text?.startsWith("/code")) { const parts = text.split(" "); const mode = parts[1]?.toLowerCase(); if (!validPrefixes.includes(mode)) { bot.sendMessage(chatId, ❌ Usage: /code v200 (or v500, v1000, etc)); return; } const codes = getCodeLines(); const filtered = codes.filter(code => code.startsWith(mode)); if (!filtered.length) { bot.sendMessage(chatId, ❌ No unused ${mode} codes found.); return; } const selected = filtered[0]; saveCodes(codes.filter(code => code !== selected)); bot.sendMessage(chatId, 🎟️ Your unlock code: ${selected}); return; }

// Add one or more codes if (text?.startsWith("/add")) { const body = text.slice(4).trim(); const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean); const allCodes = getCodeLines(); let added = 0; for (const line of lines) { const [prefix, suffix] = line.split("-"); if (validPrefixes.includes(prefix) && /^\d{6}$/.test(suffix)) { if (!allCodes.includes(line)) { allCodes.push(line); added++; } } } saveCodes(allCodes); if (added > 0) bot.sendMessage(chatId, ✅ Added ${added} code(s).); else bot.sendMessage(chatId, ⚠️ No valid codes added. Use format:\n/add\nv200-123456\nv500-654321); return; } });

console.log("🤖 Telegram bot ready for /code, /add, /view");

