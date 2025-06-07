import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname workaround for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse JSON
app.use(express.json());

// Serve static HTML from /public
app.use(express.static(path.join(__dirname, "../public")));

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// API route
import verifyCodeRoute from "./verify-code.js";
app.use("/api/verify-code", verifyCodeRoute);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
