import { createClient } from "redis";

export type Redis = ReturnType<typeof createClient>;

let client: Redis | undefined;

/** Shared Redis client for sessions and email/password storage (when `REDIS_URL` is set). */
export async function getRedis(): Promise<Redis | undefined> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return undefined;
  if (client?.isOpen) return client;
  const c = createClient({ url });
  c.on("error", (err) => console.error("Redis:", err));
  await c.connect();
  client = c;
  return c;
}
