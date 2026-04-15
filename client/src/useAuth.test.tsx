import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth.ts";

describe("useAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finishes with null user when health is ok and /api/auth/me returns 401", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (url.includes("/api/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            sessionConfigured: true,
            emailPasswordAuth: true,
            googleAuth: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({ error: "Not authenticated." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.bootError).toBeNull();
    expect(result.current.showEmailPasswordForm).toBe(true);
    expect(result.current.emailPasswordReady).toBe(true);
  });
});
