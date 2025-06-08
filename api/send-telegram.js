// ✅ Cleaned version with minor tweaks
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid or missing message" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: "Missing Telegram token or chat ID" });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML" // optional if you want bold/links/etc.
      })
    });

    const result = await response.json();
    if (!result.ok) {
      return res.status(500).json({ error: result.description || "Telegram error" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Telegram send error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
