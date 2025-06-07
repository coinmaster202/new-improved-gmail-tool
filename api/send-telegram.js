import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message } = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: 'Missing Telegram credentials' });
  }

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
      }),
    });

    const data = await telegramRes.json();

    if (!data.ok) throw new Error(data.description);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Telegram Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}