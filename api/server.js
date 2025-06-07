import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import verifyCodeRoute from "./verify-code.js";
import sendTelegramRoute from "./send-telegram.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// 🔥 Attach API routes
app.use("/api/verify-code", verifyCodeRoute);
app.use("/api/send-telegram", sendTelegramRoute);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
