import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailPasswordAvailable, isValidEmail, normalizeEmail } from "./emailPassword.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@BAR.com  ")).toBe("foo@bar.com");
  });
});

describe("isValidEmail", () => {
  it("accepts simple addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
  });
});

describe("isEmailPasswordAvailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true when REDIS_URL is set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    expect(isEmailPasswordAvailable()).toBe(true);
  });

  it("is false in production without REDIS_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    expect(isEmailPasswordAvailable()).toBe(false);
  });

  it("is true in test without REDIS_URL", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REDIS_URL", "");
    expect(isEmailPasswordAvailable()).toBe(true);
  });
});
