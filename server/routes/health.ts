import type { Express } from "express";
import { isEmailPasswordAvailable } from "../emailPassword.js";

export function registerHealthRoutes(app: Express, sessionSecret: string | null): void {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      sessionConfigured: sessionSecret !== null,
      emailPasswordAuth: Boolean(sessionSecret) && isEmailPasswordAvailable(),
      googleAuth: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  });
}
