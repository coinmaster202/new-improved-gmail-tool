export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method not allowed");

  const { message } = req.body;
  const token = "8146635109:AAFsEogsTVSKvMH-T2xtCZqPh7f9F4Ohwp0";
  const chatId = "6603090831";

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
}
