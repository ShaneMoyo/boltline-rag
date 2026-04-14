import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DIST } from "../src/paths.js";
import { runRag } from "../src/rag.js";

declare module "express-session" {
  interface SessionData {
    user: { email: string; name: string; picture: string };
  }
}

const app = express();

// Vite dev proxy sends X-Forwarded-*; trust proxy avoids mis-detection and satisfies express-rate-limit
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "64kb" }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET env var is required. Generate one with: openssl rand -hex 32");
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — try again in 15 minutes." },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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
    res.status(401).json({ error: "Sign in with Google to use this app." });
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

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.error(`API server listening on http://localhost:${port}`);
});
