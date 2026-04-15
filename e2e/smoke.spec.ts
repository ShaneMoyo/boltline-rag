import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("home loads and /api/health works via Vite proxy", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Boltline RAG/i);
    await expect(page.getByRole("heading", { name: /Boltline RAG/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const json = (await health.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });
});
