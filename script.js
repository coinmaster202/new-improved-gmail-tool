const BOT_TOKEN = "8146635109:AAFsEogsTVSKvMH-T2xtCZqPh7f9F4Ohwp0";
const CHAT_ID = "6603090831";
let requestedPrefix = "";

// Request unlock code and send Telegram notification
function requestCode(prefix) {
  requestedPrefix = prefix;
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = new Date().toISOString();

  fetch("https://api.ipify.org?format=json")
    .then(res => res.json())
    .then(data => {
      const ip = data.ip;
      const message = `🔓 New unlock request\nMode: ${prefix}\nCode: ${prefix}-${randomId}\nTime: ${timestamp}\nIP: ${ip}`;

      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      fetch(url, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message
        })
      }).then(() => {
        showStatus(`✅ Code request sent for ${prefix.toUpperCase()}. Admin will reply shortly.`);
      }).catch(() => {
        showStatus("❌ Failed to send request. Please try again.");
      });
    });
}

// Check unlock code matches expected format
function verifyCode() {
  const code = document.getElementById("code").value.trim();
  if (!code.toLowerCase().startsWith(requestedPrefix + "-")) {
    showStatus("❌ Invalid code for selected mode.");
    return;
  }

  // Success
  showStatus("✅ Code accepted. Access granted.");
  document.getElementById("unlocked-panel").style.display = "block";
  document.getElementById("unlock-buttons").style.display = "none";
  document.getElementById("code-entry").style.display = "none";
}

// Show status messages to user
function showStatus(msg) {
  document.getElementById("status").textContent = msg;
}
