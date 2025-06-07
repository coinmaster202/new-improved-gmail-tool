import express from "express";
import dotenv from "dotenv";
import verifyCodeHandler from "./verify-code.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/api/verify-code", verifyCodeHandler);

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
