import { createClient } from "redis";

export type Redis = ReturnType<typeof createClient>;

let client: Redis | undefined;

function assertTcpRedisUrl(url: string): void {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    throw new Error(
      "REDIS_URL looks like the Upstash REST/API URL. Use the Redis TCP URL from the Upstash dashboard — it starts with rediss:// (not https://)."
    );
  }
  if (!lower.startsWith("redis://") && !lower.startsWith("rediss://")) {
    throw new Error('REDIS_URL must start with redis:// or rediss:// (Upstash provides a "Redis" connection string).');
  }
}

/** Shared Redis client for sessions and email/password storage (when `REDIS_URL` is set). */
export async function getRedis(): Promise<Redis | undefined> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return undefined;

  assertTcpRedisUrl(url);

  if (client?.isOpen) {
    return client;
  }

  if (client && !client.isOpen) {
    try {
      await client.quit();
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
    client = undefined;
  }

  const c = createClient({
    url,
    socket: {
      connectTimeout: 15_000,
      reconnectStrategy: (attempts) => {
        if (attempts > 6) return new Error("Too many Redis reconnect attempts");
        return Math.min(attempts * 75, 2500);
      },
    },
  });

  c.on("error", (err) => console.error("Redis:", err));

  await c.connect();
  await c.ping();
  client = c;
  return c;
}
