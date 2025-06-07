let requestedPrefix = "";

function requestCode(prefix) {
  requestedPrefix = prefix;
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = new Date().toLocaleString();

  fetch("https://api.ipify.org?format=json")
    .then(res => res.json())
    .then(data => {
      const ip = data.ip;
      const message = `🔓 Unlock request received\nMode: ${prefix}\nCode: ${prefix}-${randomId}\nTime: ${timestamp}\nIP: ${ip}`;

      return fetch("/api/send-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
    })
    .then(() => {
      showStatus(`Code request sent. Admin will reply with your ${requestedPrefix.toUpperCase()} code.`);
    })
    .catch(() => {
      showStatus("❌ Failed to contact Telegram. Try again.");
    });
}

function verifyCode() {
  const code = document.getElementById("code").value.trim().toLowerCase();
  if (!requestedPrefix || !code.startsWith(requestedPrefix)) {
    showStatus("❌ Invalid code for selected mode.");
    return;
  }

  showStatus("✅ Code accepted. Access granted.");
  document.getElementById("unlocked-panel").style.display = "block";
  document.getElementById("unlock-buttons").style.display = "none";
  document.getElementById("code-entry").style.display = "none";
}

function showStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// === Gmail Generator ===

function generateEmails() {
  const input = document.getElementById("gmail-base").value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!input) return alert("Please enter a valid Gmail name.");

  const total = Math.pow(2, input.length - 1);
  document.getElementById("variation-count").textContent = `Possibilities: ${total}`;

  const emails = new Set();
  for (let i = 1; i < total; i++) {
    let combo = "";
    for (let j = 0; j < input.length; j++) {
      combo += input[j];
      if (j < input.length - 1 && (i & (1 << (input.length - 2 - j)))) {
        combo += ".";
      }
    }
    emails.add(combo + "@gmail.com");
  }

  const list = Array.from(emails).map(e => `<li>${e}</li>`).join("");
  document.getElementById("variation-list").innerHTML = list;
}

// === CSV Converter ===

function downloadCSV() {
  const data = document.getElementById("csv-input").value.trim().split(/\r?\n/).filter(x => x.includes("@"));
  if (!data.length) return alert("No valid emails to export.");
  const blob = new Blob([data.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "converted.csv";
  a.click();
}

// === Duplicate Checker ===

function checkDuplicates() {
  const input = document.getElementById("dupe-input").value.trim().split(/\r?\n/);
  const seen = new Set();
  const dups = [];
  input.forEach(x => {
    const clean = x.trim().toLowerCase();
    if (seen.has(clean)) dups.push(clean);
    else seen.add(clean);
  });
  const result = dups.map(d => `<li>${d}</li>`).join("");
  document.getElementById("dupe-result").innerHTML = result || "<li>No duplicates found.</li>";
}

// === File Loader ===

function loadFile(type, event) {
  const reader = new FileReader();
  reader.onload = function () {
    const content = reader.result.trim();
    if (type === "csv") document.getElementById("csv-input").value = content;
    if (type === "dupe") document.getElementById("dupe-input").value = content;
  };
  reader.readAsText(event.target.files[0]);
}
