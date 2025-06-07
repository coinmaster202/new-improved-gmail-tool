let requestedPrefix = "";
let latestVariations = [];

function requestCode(prefix) {
  requestedPrefix = prefix;
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = new Date().toLocaleString();

  fetch("https://api.ipify.org?format=json")
    .then(res => res.json())
    .then(data => {
      const message = `🔓 Unlock request\nMode: ${prefix}\nCode: ${prefix}-${randomId}\nTime: ${timestamp}\nIP: ${data.ip}`;
      return fetch("/api/send-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
    })
    .then(() => showStatus(`Code request sent. Admin will reply with your ${requestedPrefix.toUpperCase()} code.`))
    .catch(() => showStatus("❌ Failed to contact Telegram"));
}

function verifyCode() {
  const code = document.getElementById("code").value.trim().toLowerCase();
  if (!code.startsWith(requestedPrefix)) {
    return showStatus("❌ Invalid code for selected mode");
  }

  document.getElementById("unlock-screen").style.display = "none";
  document.getElementById("unlocked-panel").style.display = "block";
}

function showStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// === Tabs ===
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  };
});

// === Gmail Generator Auto Update ===
document.getElementById("gmail-base").addEventListener("input", () => {
  const input = document.getElementById("gmail-base").value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!input) {
    document.getElementById("variation-count").textContent = "Possibilities: 0";
    document.getElementById("variation-list").innerHTML = "";
    latestVariations = [];
    return;
  }

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

  latestVariations = Array.from(emails);
  document.getElementById("variation-list").innerHTML = latestVariations.map(e => `<li>${e}</li>`).join("");
});

function downloadVariations() {
  const format = document.getElementById("format-select").value;
  if (!latestVariations.length) return alert("No variations to download.");
  const content = latestVariations.join("\n");

  if (format === "csv" || format === "txt") {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gmail_variations.${format}`;
    a.click();
  } else if (format === "zip") {
    import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js').then(JSZipModule => {
      const zip = new JSZipModule.default();
      zip.file("gmail_variations.txt", content);
      zip.generateAsync({ type: "blob" }).then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gmail_variations.zip";
        a.click();
      });
    });
  }
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
