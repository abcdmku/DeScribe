import cors from "cors";
import express from "express";
import { QueryRequestSchema } from "@describe/shared";

const app = express();
const port = Number(process.env.PORT) || 8000;

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "OPTIONS"]
  })
);

// Reserved for upcoming /query validation with shared schemas.
void QueryRequestSchema;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
