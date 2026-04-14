import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DIST } from "../src/paths.js";
import { runRag } from "../src/rag.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/ask", async (req, res) => {
  try {
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const rawTop = req.body?.topK;
    const topK =
      typeof rawTop === "number" && Number.isFinite(rawTop)
        ? Math.min(20, Math.max(1, Math.floor(rawTop)))
        : 5;
    if (!question) {
      res.status(400).json({ error: "Missing or invalid question" });
      return;
    }
    const { answer, sources } = await runRag({ question, topK });
    res.json({ answer, sources });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

if (process.env.NODE_ENV === "production") {
  if (!existsSync(CLIENT_DIST)) {
    console.warn(
      `Build output missing at ${CLIENT_DIST}. Run "npm run build:client" before "npm start".`
    );
  }
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(join(CLIENT_DIST, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.error(`API server listening on http://localhost:${port}`);
});
