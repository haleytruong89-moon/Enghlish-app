import { expect, type Page } from "@playwright/test";
import { auth } from "@/lib/copy/vi";
import {
  SEED_ACCOUNTS,
  TEST_LEARNER_AN_ID,
  TEST_LEARNER_NGUYEN_ID,
  type SeedUsers,
} from "../../scripts/lib/seed";

export type AccountKey = keyof SeedUsers;

export const LEARNER_IDS = { an: TEST_LEARNER_AN_ID, nguyen: TEST_LEARNER_NGUYEN_ID } as const;

/** Same pattern as scripts/seed-dev.ts (SEED_EMAIL_DOMAIN defaults to example.com). */
export function emailFor(key: AccountKey): string {
  const domain = process.env.SEED_EMAIL_DOMAIN || "example.com";
  return `eng-test-${SEED_ACCOUNTS[key].emailLocal}@${domain}`;
}

export function seedPassword(): string {
  const password = process.env.SEED_DEV_PASSWORD;
  if (!password) throw new Error("SEED_DEV_PASSWORD must be set for e2e tests");
  return password;
}

/** Fill the login form through the UI and submit it. Does not wait for the result. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(auth.email).fill(email);
  await page.getByLabel(auth.password).fill(password);
  await page.getByRole("button", { name: auth.submit, exact: true }).click();
}

/** Log in as one of the seeded test accounts and wait until the home page is shown. */
export async function loginAs(page: Page, key: AccountKey): Promise<void> {
  await submitLogin(page, emailFor(key), seedPassword());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: auth.signOut })).toBeVisible();
}

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  return { url, anonKey };
}
