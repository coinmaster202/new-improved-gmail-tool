import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Missing Telegram config in environment' });
  }

  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });

    const data = await telegramRes.json();

    if (!data.ok) {
      throw new Error(data.description || 'Telegram API Error');
    }

    res.status(200).json({ success: true, message: 'Sent to Telegram' });
  } catch (err) {
    console.error('Telegram error:', err);
    res.status(500).json({ error: 'Telegram send failed' });
  }
}