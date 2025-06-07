import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message" });

  const token = "8146635109:AAFsEogsTVSKvMH-T2xtCZqPh7f9F4Ohwp0";
  const chatId = "6630390831";

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
    if (!data.ok) throw new Error(data.description);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Telegram error:", err);
    res.status(500).json({ error: err.message || "Telegram error" });
  }
});

export default router;
