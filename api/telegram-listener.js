import TelegramBot from 'node-telegram-bot-api';
import { Redis } from '@upstash/redis';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const limits = {
  v200: 200,
  v500: 500,
  v1000: 1000,
  v5000: 5000,
  unlimt: Infinity
};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase().trim();

  if (!text || !text.includes('-')) return;

  const [prefix, suffix] = text.split('-');
  if (!limits[prefix] || suffix.length !== 6) {
    return bot.sendMessage(chatId, `❌ Invalid code format.\nUse like: v200-123456`);
  }

  const exists = await redis.get(text);
  if (exists) {
    return bot.sendMessage(chatId, `⚠️ Code ${text} is already used.`);
  }

  await redis.set(text, true);
  bot.sendMessage(chatId, `✅ Code ${text} stored! Max variations: ${limits[prefix]}`);
});