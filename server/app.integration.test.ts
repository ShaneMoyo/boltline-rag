import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { RunRagFn } from "./routes/ask.js";

const runRagMock = vi.fn();

describe("createApp (integration)", () => {
  let app: Express;
  const email = `integration-${Date.now()}@example.com`;
  const password = "testpass12";

  beforeAll(async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret-for-integration-tests-only");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const { createApp } = await import("./app.js");
    app = await createApp({ runRag: runRagMock as RunRagFn });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("GET /api/health returns ok and flags", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body).toMatchObject({
      ok: true,
      sessionConfigured: true,
      emailPasswordAuth: true,
      googleAuth: false,
    });
  });

  it("GET /api/auth/me returns 401 without session", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("registers, returns user, and /api/auth/me sees session", async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post("/api/auth/register")
      .send({ email, password, name: "Integration" })
      .expect(200);
    expect(reg.body.user).toMatchObject({
      email,
      name: "Integration",
      picture: "",
    });

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user?.email).toBe(email);
  });

  it("logs out and login works with password", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ email: `login-${email}`, password, name: "L" })
      .expect(200);

    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/auth/me").expect(401);

    const login = await agent
      .post("/api/auth/login")
      .send({ email: `login-${email}`, password })
      .expect(200);
    expect(login.body.user?.email).toBe(`login-${email}`);

    await agent.get("/api/auth/me").expect(200);
  });

  it("POST /api/ask uses mocked runRag when authenticated", async () => {
    vi.mocked(runRagMock).mockClear();
    vi.mocked(runRagMock).mockResolvedValue({
      answer: "stubbed-answer",
      sources: [],
    });

    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ email: `ask-${email}`, password, name: "Ask" })
      .expect(200);

    const res = await agent
      .post("/api/ask")
      .send({ question: "hello?", topK: 3 })
      .expect(200);

    expect(res.body.answer).toBe("stubbed-answer");
    expect(res.body.sources).toEqual([]);
    expect(typeof res.body.conversationId).toBe("string");
    expect(vi.mocked(runRagMock)).toHaveBeenCalledWith(
      expect.objectContaining({ question: "hello?", topK: 3 })
    );
  });

  it("saves Q/A to conversation history and supports list, get, append, delete", async () => {
    vi.mocked(runRagMock).mockResolvedValue({
      answer: "first-answer",
      sources: [{ sourcePath: "a.md", chunkIndex: 0, score: 0.9, text: "ctx" }],
    });

    const agent = request.agent(app);
    const convEmail = `conv-${email}`;
    await agent
      .post("/api/auth/register")
      .send({ email: convEmail, password, name: "Conv" })
      .expect(200);

    const first = await agent
      .post("/api/ask")
      .send({ question: "First question here?", topK: 5 })
      .expect(200);

    expect(first.body.answer).toBe("first-answer");
    const cid = first.body.conversationId as string;
    expect(cid).toBeTruthy();

    const list = await agent.get("/api/conversations").expect(200);
    expect(Array.isArray(list.body.conversations)).toBe(true);
    expect(list.body.conversations.length).toBeGreaterThanOrEqual(1);
    const hit = list.body.conversations.find((c: { id: string }) => c.id === cid);
    expect(hit?.title).toBeTruthy();

    const detail = await agent.get(`/api/conversations/${cid}`).expect(200);
    expect(detail.body.conversation?.id).toBe(cid);
    expect(detail.body.conversation?.turns?.length).toBe(1);
    expect(detail.body.conversation?.turns?.[0]?.question).toContain("First question");

    vi.mocked(runRagMock).mockResolvedValueOnce({
      answer: "second-answer",
      sources: [],
    });

    const second = await agent
      .post("/api/ask")
      .send({ question: "Follow-up?", topK: 5, conversationId: cid })
      .expect(200);

    expect(second.body.answer).toBe("second-answer");
    expect(second.body.conversationId).toBe(cid);

    const afterSecond = await agent.get(`/api/conversations/${cid}`).expect(200);
    expect(afterSecond.body.conversation?.turns?.length).toBe(2);

    await agent.delete(`/api/conversations/${cid}`).expect(200);
    await agent.get(`/api/conversations/${cid}`).expect(404);
  });
});
