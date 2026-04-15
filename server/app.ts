import "dotenv/config";
import "./sessionTypes.js";
import cors from "cors";
import express from "express";
import { jsonRateLimit } from "./rateLimitJson.js";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DIST } from "../src/paths.js";
import bcrypt from "bcryptjs";
import { runRag } from "../src/rag.js";
import {
  createPasswordUser,
  findPasswordUser,
  isEmailPasswordAvailable,
  isValidEmail,
  normalizeEmail,
} from "./emailPassword.js";
import { buildSessionMiddleware } from "./buildSession.js";

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

export async function createApp(): Promise<express.Express> {
  const app = express();

  app.set("trust proxy", 1);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "64kb" }));

  const sessionSecret = resolveSessionSecret();

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      sessionConfigured: sessionSecret !== null,
      emailPasswordAuth: Boolean(sessionSecret) && isEmailPasswordAvailable(),
      googleAuth: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  });

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

    app.post("/api/auth/google", async (req, res) => {
      if (!googleClient || !googleClientId) {
        res.status(501).json({ error: "Google auth is not configured on this server." });
        return;
      }
      const { credential } = req.body as { credential?: string };
      if (!credential) {
        res.status(400).json({ error: "Missing credential." });
        return;
      }
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: googleClientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) {
          res.status(401).json({ error: "Invalid Google token." });
          return;
        }
        req.session.user = {
          email: payload.email,
          name: payload.name ?? payload.email,
          picture: payload.picture ?? "",
        };
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error(saveErr);
            res.status(500).json({ error: "Could not create session." });
            return;
          }
          res.json({ user: req.session.user });
        });
      } catch (e) {
        console.error(e);
        res.status(401).json({ error: "Failed to verify Google token." });
      }
    });

    app.post("/api/auth/register", authRegisterLimiter, async (req, res) => {
      if (!isEmailPasswordAvailable()) {
        res.status(503).json({
          error:
            "Email sign-in needs REDIS_URL in production. Add Upstash Redis and set REDIS_URL on the server.",
        });
        return;
      }
      const emailRaw = typeof req.body?.email === "string" ? req.body.email : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const nameRaw = typeof req.body?.name === "string" ? req.body.name : "";
      const email = normalizeEmail(emailRaw);
      const name = nameRaw.trim() || email.split("@")[0] || email;
      if (!isValidEmail(email) || password.length < 8 || password.length > 128) {
        res.status(400).json({
          error: "Use a valid email and a password of 8–128 characters.",
        });
        return;
      }
      try {
        if (await findPasswordUser(email)) {
          res.status(409).json({ error: "An account with this email already exists." });
          return;
        }
        const hash = await bcrypt.hash(password, 10);
        await createPasswordUser(email, hash, name);
        req.session.user = { email, name, picture: "" };
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error(saveErr);
            res.status(500).json({ error: "Could not create session." });
            return;
          }
          res.json({ user: req.session.user });
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Registration failed." });
      }
    });

    app.post("/api/auth/login", authLoginLimiter, async (req, res) => {
      if (!isEmailPasswordAvailable()) {
        res.status(503).json({
          error:
            "Email sign-in needs REDIS_URL in production. Add Upstash Redis and set REDIS_URL on the server.",
        });
        return;
      }
      const emailRaw = typeof req.body?.email === "string" ? req.body.email : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const email = normalizeEmail(emailRaw);
      if (!isValidEmail(email) || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }
      try {
        const row = await findPasswordUser(email);
        if (!row || !(await bcrypt.compare(password, row.hash))) {
          res.status(401).json({ error: "Invalid email or password." });
          return;
        }
        req.session.user = {
          email,
          name: row.name,
          picture: "",
        };
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error(saveErr);
            res.status(500).json({ error: "Could not create session." });
            return;
          }
          res.json({ user: req.session.user });
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Sign-in failed." });
      }
    });

    app.post("/api/auth/logout", (req, res) => {
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    });

    app.get("/api/auth/me", (req, res, next) => {
      try {
        const user = req.session?.user;
        if (!user) {
          res.status(401).json({ error: "Not authenticated." });
          return;
        }
        res.json({ user });
      } catch (e) {
        next(e);
      }
    });

    function requireAuth(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ): void {
      if (!req.session?.user) {
        res.status(401).json({ error: "Sign in to use this app." });
        return;
      }
      next();
    }

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
        const { answer, sources } = await runRag({ question, topK });
        res.json({ answer, sources });
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    });
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
