import { Router, type Express, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import type { OAuth2Client } from "google-auth-library";
import {
  createPasswordUser,
  findPasswordUser,
  isEmailPasswordAvailable,
  isValidEmail,
  normalizeEmail,
} from "../emailPassword.js";
type AuthRouteDeps = {
  authRegisterLimiter: RequestHandler;
  authLoginLimiter: RequestHandler;
  googleClient: OAuth2Client | null;
  googleClientId: string | undefined;
};

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps): void {
  const { authRegisterLimiter, authLoginLimiter, googleClient, googleClientId } = deps;
  const r = Router();

  r.post("/google", async (req, res) => {
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

  r.post("/register", authRegisterLimiter, async (req, res) => {
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

  r.post("/login", authLoginLimiter, async (req, res) => {
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

  r.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  r.get("/me", (req, res, next) => {
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

  app.use("/api/auth", r);
}
