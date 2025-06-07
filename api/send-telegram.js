import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message content" });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: "Missing Telegram token or chat ID" });
  }

  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    const data = await telegramRes.json();

    if (!data.ok) {
      console.error("Telegram API error:", data.description);
      return res.status(500).json({ error: data.description || "Telegram API failed" });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Telegram send error:", err);
    res.status(500).json({ error: "Server error sending message" });
  }
}