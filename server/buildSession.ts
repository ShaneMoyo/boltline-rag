import session from "express-session";
import { RedisStore } from "connect-redis";
import { getRedis } from "./redisClient.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Redis TTL for session keys (seconds); keep in sync with cookie maxAge. */
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

/**
 * Session middleware: prefers Redis when `REDIS_URL` is set (required for stable
 * login on Vercel serverless — MemoryStore is per-instance only).
 */
export async function buildSessionMiddleware(
  secret: string
): Promise<ReturnType<typeof session>> {
  const cookie: session.CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: THIRTY_DAYS_MS,
    path: "/",
  };

  const base: session.SessionOptions = {
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: "boltline.sid",
    cookie,
  };

  try {
    const client = await getRedis();
    if (client) {
      return session({
        ...base,
        store: new RedisStore({
          client,
          prefix: "boltline:sess:",
          ttl: THIRTY_DAYS_SEC,
        }),
      });
    }
  } catch (e) {
    console.error("Redis connect failed; using MemoryStore:", e);
  }

  if (process.env.VERCEL && process.env.NODE_ENV === "production") {
    console.warn(
      "REDIS_URL not set — sessions use MemoryStore and logins can reset when another Vercel instance runs. Add Upstash Redis and REDIS_URL for persistent sessions."
    );
  }

  return session(base);
}
