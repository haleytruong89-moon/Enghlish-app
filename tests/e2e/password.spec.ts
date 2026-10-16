import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { account, auth } from "@/lib/copy/vi";
import { submitLogin, supabaseEnv } from "./helpers";

// A dedicated throwaway account (created here with the service role, deleted afterwards): the seeded test accounts keep
// their password, so the other specs are not affected. The account has no row in english.members on purpose: the page
// works for any signed-in user.
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `eng-test-changepw-${SUFFIX}@example.com`;
const OLD_PASSWORD = "old-e2e-password-1234";
const NEW_PASSWORD = "new-e2e-password-5678";

const adminClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for the password e2e test");
  return createClient(supabaseEnv().url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

let userId = "";

test.beforeAll(async () => {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: EMAIL,
    password: OLD_PASSWORD,
    email_confirm: true,
    user_metadata: { app: "learning-os", is_test: true },
  });
  if (error || !data.user) throw new Error(`could not create the throwaway account: ${error?.message}`);
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await adminClient().auth.admin.deleteUser(userId);
});

test("a signed-in user changes their own password and logs in with the new one", async ({ page, browser }) => {
  await submitLogin(page, EMAIL, OLD_PASSWORD);
  await expect(page.getByRole("button", { name: auth.signOut })).toBeVisible();

  // the link is in the header
  await page.getByTestId("change-password-link").click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole("heading", { level: 1, name: account.title })).toBeVisible();

  // validation first: too short, then two different entries
  await page.getByLabel(account.newPassword).fill("short");
  await page.getByLabel(account.confirmPassword).fill("short");
  await page.getByRole("button", { name: account.submit }).click();
  await expect(page.locator("#password-error")).toHaveText(account.errorShort);
  await page.getByLabel(account.newPassword).fill(NEW_PASSWORD);
  await page.getByLabel(account.confirmPassword).fill(`${NEW_PASSWORD}x`);
  await page.getByRole("button", { name: account.submit }).click();
  await expect(page.locator("#password-error")).toHaveText(account.errorMismatch);

  // the real change
  await page.getByLabel(account.confirmPassword).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: account.submit }).click();
  await expect(page.locator("#password-done")).toHaveText(account.success);

  // a fresh browser: the old password no longer works, the new one does
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await submitLogin(fresh, EMAIL, OLD_PASSWORD);
  await expect(fresh.locator("#login-error")).toHaveText(auth.errorInvalid);
  await submitLogin(fresh, EMAIL, NEW_PASSWORD);
  await expect(fresh.getByRole("button", { name: auth.signOut })).toBeVisible();
  await ctx.close();
});

test("the page needs a session: signed-out visitors go to /login", async ({ page }) => {
  await page.goto("/account/password");
  await expect(page).toHaveURL(/\/login/);
});
