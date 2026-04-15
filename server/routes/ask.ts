import type { Express, RequestHandler } from "express";
import { runRag as defaultRunRag } from "../../src/rag.js";
import { requireAuth } from "../middleware/requireAuth.js";

export type RunRagFn = typeof defaultRunRag;

export function registerAskRoutes(
  app: Express,
  askLimiter: RequestHandler,
  runRagImpl: RunRagFn
): void {
  app.post("/api/ask", askLimiter, requireAuth, async (req, res) => {
    try {
      const question =
        typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const rawTop = req.body?.topK;
      const topK =
        typeof rawTop === "number" && Number.isFinite(rawTop)
          ? Math.min(20, Math.max(1, Math.floor(rawTop)))
          : 5;
      if (!question) {
        res.status(400).json({ error: "Missing or invalid question." });
        return;
      }
      const { answer, sources } = await runRagImpl({ question, topK });
      res.json({ answer, sources });
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
}
