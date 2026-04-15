import type { Express, RequestHandler } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  deleteConversation,
  getConversation,
  listConversations,
} from "../conversationsStore.js";

export function registerConversationRoutes(
  app: Express,
  conversationLimiter: RequestHandler
): void {
  app.get("/api/conversations", conversationLimiter, requireAuth, async (req, res) => {
    try {
      const email = req.session.user!.email;
      const conversations = await listConversations(email);
      res.json({ conversations });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load conversations." });
    }
  });

  app.get("/api/conversations/:id", conversationLimiter, requireAuth, async (req, res) => {
    try {
      const email = req.session.user!.email;
      const id =
        typeof req.params.id === "string" && req.params.id.trim() ? req.params.id.trim() : "";
      if (!id) {
        res.status(400).json({ error: "Missing conversation id." });
        return;
      }
      const conversation = await getConversation(email, id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      res.json({ conversation });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load conversation." });
    }
  });

  app.delete("/api/conversations/:id", conversationLimiter, requireAuth, async (req, res) => {
    try {
      const email = req.session.user!.email;
      const id =
        typeof req.params.id === "string" && req.params.id.trim() ? req.params.id.trim() : "";
      if (!id) {
        res.status(400).json({ error: "Missing conversation id." });
        return;
      }
      const ok = await deleteConversation(email, id);
      if (!ok) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not delete conversation." });
    }
  });
}
