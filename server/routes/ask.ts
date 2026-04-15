import type { Express, RequestHandler } from "express";
import { runRag as defaultRunRag } from "../../src/rag.js";
import { appendTurn } from "../conversationsStore.js";
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
      const rawConv = req.body?.conversationId;
      const conversationId =
        typeof rawConv === "string" && rawConv.trim() ? rawConv.trim() : null;
      if (!question) {
        res.status(400).json({ error: "Missing or invalid question." });
        return;
      }
      const { answer, sources } = await runRagImpl({ question, topK });
      const email = req.session.user!.email;

      let savedId: string | undefined;
      try {
        const out = await appendTurn(email, conversationId, { question, answer, topK, sources });
        savedId = out.conversationId;
      } catch (err) {
        const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
        if (code === "NOT_FOUND") {
          console.warn("appendTurn: conversation not found for user; response not linked to history.");
        } else if (code === "LIMIT") {
          console.warn("appendTurn:", err instanceof Error ? err.message : "limit");
        } else {
          console.error("appendTurn failed:", err);
        }
      }

      res.json({
        answer,
        sources,
        ...(savedId ? { conversationId: savedId } : {}),
      });
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });
}
