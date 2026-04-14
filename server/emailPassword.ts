import type { Redis } from "./redisClient.js";
import { getRedis } from "./redisClient.js";

const REDIS_KEY_PREFIX = "boltline:passuser:";

/** Dev-only fallback when `REDIS_URL` is unset (not for production). */
const devMemory = new Map<string, { hash: string; name: string }>();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Email/password auth works with Redis, or in non-production without Redis (in-memory). */
export function isEmailPasswordAvailable(): boolean {
  if (process.env.REDIS_URL?.trim()) return true;
  return process.env.NODE_ENV !== "production";
}

async function writeUser(
  redis: Redis | undefined,
  email: string,
  hash: string,
  name: string
): Promise<void> {
  const key = normalizeEmail(email);
  const payload = JSON.stringify({ h: hash, n: name });
  if (redis) {
    await redis.set(REDIS_KEY_PREFIX + key, payload);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    devMemory.set(key, { hash, name });
    return;
  }
  throw new Error("REDIS_REQUIRED");
}

export async function findPasswordUser(
  email: string
): Promise<{ hash: string; name: string } | null> {
  const key = normalizeEmail(email);
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(REDIS_KEY_PREFIX + key);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as { h: string; n: string };
      return { hash: o.h, name: o.n };
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return devMemory.get(key) ?? null;
  }
  return null;
}

export async function createPasswordUser(
  email: string,
  passwordHash: string,
  name: string
): Promise<void> {
  const redis = await getRedis();
  await writeUser(redis, email, passwordHash, name);
}
