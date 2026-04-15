import { randomUUID } from "node:crypto";
import type { RagSource } from "../src/rag.js";
import { getRedis } from "./redisClient.js";
import { normalizeEmail } from "./emailPassword.js";

const PREFIX_DATA = "boltline:conv:data:";
const PREFIX_ORDER = "boltline:conv:order:";

export const TITLE_MAX_LEN = 60;
const MAX_TURNS_PER_CONVERSATION = 50;
const MAX_CONVERSATIONS_PER_USER = 80;
const MAX_SNIPPET_CHARS = 8000;

export type ConversationTurn = {
  id: string;
  createdAt: string;
  question: string;
  answer: string;
  topK: number;
  sources: RagSource[];
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  turns: ConversationTurn[];
};

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

type UserBucket = {
  order: string[];
  data: Map<string, Conversation>;
};

const devBuckets = new Map<string, UserBucket>();

function bucketKey(email: string): string {
  return normalizeEmail(email);
}

function getDevBucket(email: string): UserBucket {
  const k = bucketKey(email);
  let b = devBuckets.get(k);
  if (!b) {
    b = { order: [], data: new Map() };
    devBuckets.set(k, b);
  }
  return b;
}

function truncateSources(sources: RagSource[]): RagSource[] {
  return sources.map((s) => ({
    ...s,
    text:
      s.text.length > MAX_SNIPPET_CHARS
        ? `${s.text.slice(0, MAX_SNIPPET_CHARS)}…`
        : s.text,
  }));
}

function deriveTitle(question: string): string {
  const q = question.trim().replace(/\s+/g, " ");
  if (q.length <= TITLE_MAX_LEN) return q || "Chat";
  return `${q.slice(0, TITLE_MAX_LEN)}…`;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

async function storageAvailable(): Promise<boolean> {
  const redis = await getRedis();
  if (redis) return true;
  return !isProduction();
}

function ensureDevOrThrow(): void {
  if (isProduction()) {
    throw new Error(
      "Conversation history requires REDIS_URL in production. Add Upstash Redis and set REDIS_URL."
    );
  }
}

function dataKey(email: string, id: string): string {
  return `${PREFIX_DATA}${bucketKey(email)}:${id}`;
}

function orderKey(email: string): string {
  return `${PREFIX_ORDER}${bucketKey(email)}`;
}

async function readOrderRedis(email: string): Promise<string[]> {
  const redis = await getRedis();
  if (!redis) return [];
  const raw = await redis.get(orderKey(email));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function writeOrderRedis(email: string, order: string[]): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");
  await redis.set(orderKey(email), JSON.stringify(order));
}

async function readConvRedis(email: string, id: string): Promise<Conversation | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(dataKey(email, id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

async function writeConvRedis(email: string, conv: Conversation): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");
  const payload = JSON.stringify(conv);
  if (payload.length > 900_000) {
    throw new Error("Conversation payload too large.");
  }
  await redis.set(dataKey(email, conv.id), payload);
}

async function deleteConvRedis(email: string, id: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");
  await redis.del(dataKey(email, id));
}

/** List conversations (newest first). */
export async function listConversations(email: string): Promise<ConversationListItem[]> {
  if (!(await storageAvailable())) return [];

  const redis = await getRedis();
  if (redis) {
    const order = await readOrderRedis(email);
    const out: ConversationListItem[] = [];
    for (const id of order) {
      const c = await readConvRedis(email, id);
      if (c) out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt });
    }
    return out;
  }

  ensureDevOrThrow();
  const b = getDevBucket(email);
  return b.order
    .map((id) => {
      const c = b.data.get(id);
      return c ? { id: c.id, title: c.title, updatedAt: c.updatedAt } : null;
    })
    .filter((x): x is ConversationListItem => x !== null);
}

export async function getConversation(email: string, id: string): Promise<Conversation | null> {
  if (!(await storageAvailable())) return null;

  const redis = await getRedis();
  if (redis) {
    return readConvRedis(email, id);
  }

  ensureDevOrThrow();
  return getDevBucket(email).data.get(id) ?? null;
}

export async function deleteConversation(email: string, id: string): Promise<boolean> {
  if (!(await storageAvailable())) return false;

  const redis = await getRedis();
  if (redis) {
    const conv = await readConvRedis(email, id);
    if (!conv) return false;
    const order = (await readOrderRedis(email)).filter((x) => x !== id);
    await writeOrderRedis(email, order);
    await deleteConvRedis(email, id);
    return true;
  }

  ensureDevOrThrow();
  const b = getDevBucket(email);
  if (!b.data.has(id)) return false;
  b.data.delete(id);
  b.order = b.order.filter((x) => x !== id);
  return true;
}

export type AppendTurnInput = {
  question: string;
  answer: string;
  topK: number;
  sources: RagSource[];
};

/** Create or append a turn; returns conversation id. */
export async function appendTurn(
  email: string,
  conversationId: string | null,
  input: AppendTurnInput
): Promise<{ conversationId: string }> {
  const now = new Date().toISOString();
  const turn: ConversationTurn = {
    id: randomUUID(),
    createdAt: now,
    question: input.question,
    answer: input.answer,
    topK: input.topK,
    sources: truncateSources(input.sources),
  };

  const redis = await getRedis();

  if (redis) {
    if (conversationId) {
      const existing = await readConvRedis(email, conversationId);
      if (!existing) {
        const err = new Error("NOT_FOUND");
        (err as Error & { code?: string }).code = "NOT_FOUND";
        throw err;
      }
      if (existing.turns.length >= MAX_TURNS_PER_CONVERSATION) {
        const err = new Error("Turn limit reached for this conversation.");
        (err as Error & { code?: string }).code = "LIMIT";
        throw err;
      }
      const updated: Conversation = {
        ...existing,
        updatedAt: now,
        turns: [...existing.turns, turn],
      };
      await writeConvRedis(email, updated);
      let order = await readOrderRedis(email);
      order = [updated.id, ...order.filter((x) => x !== updated.id)];
      await writeOrderRedis(email, order);
      return { conversationId: updated.id };
    }

    const id = randomUUID();
    const conv: Conversation = {
      id,
      title: deriveTitle(input.question),
      updatedAt: now,
      turns: [turn],
    };

    let order = await readOrderRedis(email);
    while (order.length >= MAX_CONVERSATIONS_PER_USER) {
      const victim = order.pop();
      if (victim) await deleteConvRedis(email, victim);
    }
    order = [id, ...order];
    await writeConvRedis(email, conv);
    await writeOrderRedis(email, order);
    return { conversationId: id };
  }

  ensureDevOrThrow();
  const b = getDevBucket(email);

  if (conversationId) {
    const existing = b.data.get(conversationId);
    if (!existing) {
      const err = new Error("NOT_FOUND");
      (err as Error & { code?: string }).code = "NOT_FOUND";
      throw err;
    }
    if (existing.turns.length >= MAX_TURNS_PER_CONVERSATION) {
      const err = new Error("Turn limit reached for this conversation.");
      (err as Error & { code?: string }).code = "LIMIT";
      throw err;
    }
    const updated: Conversation = {
      ...existing,
      updatedAt: now,
      turns: [...existing.turns, turn],
    };
    b.data.set(updated.id, updated);
    b.order = [updated.id, ...b.order.filter((x) => x !== updated.id)];
    return { conversationId: updated.id };
  }

  const id = randomUUID();
  const conv: Conversation = {
    id,
    title: deriveTitle(input.question),
    updatedAt: now,
    turns: [turn],
  };
  while (b.order.length >= MAX_CONVERSATIONS_PER_USER) {
    const victim = b.order.pop();
    if (victim) b.data.delete(victim);
  }
  b.data.set(id, conv);
  b.order = [id, ...b.order];
  return { conversationId: id };
}
