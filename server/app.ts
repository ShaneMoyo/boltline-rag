import "dotenv/config";
import "./sessionTypes.js";
import cors from "cors";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DIST } from "../src/paths.js";
import { runRag } from "../src/rag.js";
import { buildSessionMiddleware } from "./buildSession.js";
import { jsonRateLimit } from "./rateLimitJson.js";
import { registerAskRoutes, type RunRagFn } from "./routes/ask.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerHealthRoutes } from "./routes/health.js";

export type CreateAppOptions = {
  runRag?: RunRagFn;
};

/** In production, missing SESSION_SECRET returns null so the app still boots (health + clear 503 on auth). */
function resolveSessionSecret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "SESSION_SECRET is not set — auth routes return 503 until you add it (e.g. Vercel → Environment Variables)."
    );
    return null;
  }
  console.warn(
    "SESSION_SECRET is not set — using a fixed dev-only default so the API can start. " +
      "Set SESSION_SECRET in .env for stable sessions across restarts."
  );
  return "dev-only-insecure-session-secret-do-not-use-in-production";
}

export async function createApp(options: CreateAppOptions = {}): Promise<express.Express> {
  const runRagImpl: RunRagFn = options.runRag ?? runRag;
  const app = express();

  app.set("trust proxy", 1);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "64kb" }));

  const sessionSecret = resolveSessionSecret();

  registerHealthRoutes(app, sessionSecret);

  if (!sessionSecret) {
    const noSession = (_req: express.Request, res: express.Response) => {
      res.status(503).json({
        error:
          "SESSION_SECRET is not set on the server. In Vercel: Project → Settings → Environment Variables → add SESSION_SECRET (e.g. run openssl rand -hex 32 locally), save, then redeploy.",
      });
    };
    app.use("/api/auth", noSession);
    app.post("/api/ask", noSession);
  } else {
    app.use(await buildSessionMiddleware(sessionSecret));

    const askLimiter = jsonRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: "Too many requests — try again in 15 minutes.",
    });

    const conversationLimiter = jsonRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 120,
      message: "Too many conversation requests — try again in 15 minutes.",
    });

    const authRegisterLimiter = jsonRateLimit({
      windowMs: 60 * 60 * 1000,
      max: 20,
      message: "Too many registration attempts — try again later.",
    });

    const authLoginLimiter = jsonRateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      message: "Too many sign-in attempts — try again in 15 minutes.",
    });

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

    registerAuthRoutes(app, {
      authRegisterLimiter,
      authLoginLimiter,
      googleClient,
      googleClientId,
    });

    registerAskRoutes(app, askLimiter, runRagImpl);
    registerConversationRoutes(app, conversationLimiter);
  }

  const isVercel = Boolean(process.env.VERCEL);
  if (process.env.NODE_ENV === "production" && !isVercel) {
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

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      if (res.headersSent) return;
      const message = err instanceof Error ? err.message : "Server error";
      res.status(500).json({ error: message });
    }
  );

  return app;
}
