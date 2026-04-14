import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const runRagMock = vi.fn();

vi.mock("../src/rag.js", () => ({
  runRag: (opts: unknown) => runRagMock(opts),
}));

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
    app = await createApp();
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
    runRagMock.mockClear();
    runRagMock.mockResolvedValue({
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
    expect(runRagMock).toHaveBeenCalledWith(
      expect.objectContaining({ question: "hello?", topK: 3 })
    );
  });
});
