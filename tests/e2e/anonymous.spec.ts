import { expect, request, test } from "@playwright/test";
import { auth } from "@/lib/copy/vi";
import { LEARNER_IDS, supabaseEnv } from "./helpers";

test.describe("signed-out visitor", () => {
  for (const path of ["/", "/anything-else"]) {
    test(`page ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { level: 1, name: auth.title })).toBeVisible();
    });
  }

  test("API answers 401 without a session", async ({ request: api }) => {
    const res = await api.get(`/api/learners/${LEARNER_IDS.an}`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Supabase as an anonymous caller", () => {
  test("anon cannot read english.learners", async () => {
    const { url, anonKey } = supabaseEnv();
    const api = await request.newContext({ baseURL: url });
    const res = await api.get("/rest/v1/learners?select=id,alias", {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Accept-Profile": "english" },
    });
    const text = await res.text();
    if (res.ok()) {
      expect(JSON.parse(text)).toEqual([]);
    } else {
      expect([401, 403, 404]).toContain(res.status());
    }
    expect(text).not.toContain(LEARNER_IDS.an);
    expect(text).not.toContain(LEARNER_IDS.nguyen);
    await api.dispose();
  });

  test("sign-ups are disabled", async () => {
    const { url, anonKey } = supabaseEnv();
    const api = await request.newContext({ baseURL: url });
    const res = await api.post("/auth/v1/signup", {
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      data: { email: `eng-e2e-signup-${Date.now()}@example.com`, password: "a-long-enough-password-123" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    await api.dispose();
  });
});
