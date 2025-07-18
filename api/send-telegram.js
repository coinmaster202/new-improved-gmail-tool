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
  const ipinfoToken = process.env.IPINFO_TOKEN; // optional if you have it

  if (!token || !chatId) {
    return res.status(500).json({ error: "Missing Telegram token or chat ID" });
  }

  // 🌍 Extract real IP from headers or socket
  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = forwarded ? forwarded.split(",")[0] : req.socket.remoteAddress;

  let locationInfo = "";

  try {
    const locURL = ipinfoToken
      ? `https://ipinfo.io/${clientIp}?token=${ipinfoToken}`
      : `https://ipinfo.io/${clientIp}/json`;

    const locRes = await fetch(locURL);
    const geo = await locRes.json();

    locationInfo = `\n\n🌍 Location Info:
IP: ${clientIp}
City: ${geo.city || "?"}
Region: ${geo.region || "?"}
Country: ${geo.country || "?"}
Coords: ${geo.loc || "?"}
ISP: ${geo.org || "?"}
Timezone: ${geo.timezone || "?"}`;
  } catch (e) {
    console.warn("IP lookup failed:", e);
    locationInfo = `\n\n🌍 Location Info: Failed to fetch`;
  }

  try {
    const fullMessage = `${message}${locationInfo}`;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: fullMessage,
        parse_mode: "HTML"
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