import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests. They expect a running app (npm start) wired to a real Supabase
 * stack that was seeded with `npm run db:seed-dev` — see the `e2e` job in .github/workflows/ci.yml.
 *
 * Env: E2E_BASE_URL (default http://127.0.0.1:3000), SEED_DEV_PASSWORD,
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "vi-VN",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
