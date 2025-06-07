import express from "express";
import verifyHandler from "./verify-code.js";

const app = express();
app.use(express.json());

app.post("/api/verify-code", verifyHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
