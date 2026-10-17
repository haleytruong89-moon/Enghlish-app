import { expect, test } from "@playwright/test";
import { app, auth } from "@/lib/copy/vi";
import { SEED_ACCOUNTS } from "../../scripts/lib/seed";
import { emailFor, loginAs, seedPassword, submitLogin } from "./helpers";

test.describe("login page", () => {
  test("renders the Vietnamese login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: auth.title })).toBeVisible();
    await expect(page.getByText(app.name, { exact: true })).toBeVisible();
    await expect(page.getByLabel(auth.login)).toBeVisible();
    await expect(page.getByLabel(auth.password)).toBeVisible();
    await expect(page.getByRole("button", { name: auth.submit, exact: true })).toBeEnabled();
  });

  test("wrong password shows the Vietnamese error and stays on /login", async ({ page }) => {
    await submitLogin(page, emailFor("studentAn"), "definitely-not-the-password");
    await expect(page.locator("#login-error")).toHaveText(auth.errorInvalid);
    await expect(page).toHaveURL(/\/login/);
  });

  test("empty password shows the 'missing' message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(auth.login).fill(emailFor("studentAn"));
    await page.getByRole("button", { name: auth.submit, exact: true }).click();
    await expect(page.locator("#login-error")).toHaveText(auth.errorMissing);
  });

  test("a short login name signs in (no email typed)", async ({ page }) => {
    await submitLogin(page, SEED_ACCOUNTS.studentAn.loginName, seedPassword());
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: auth.signOut })).toBeVisible();
  });

  test("the login name is case-insensitive and the email still works", async ({ page }) => {
    await submitLogin(page, SEED_ACCOUNTS.tutorAn.loginName.toUpperCase(), seedPassword());
    await expect(page).toHaveURL(/\/$/);
    await loginAs(page, "studentNguyen"); // email path unchanged
  });

  test("an unknown name and a wrong password show the SAME message, and no email is on the page", async ({ page }) => {
    await submitLogin(page, "khong-co-ten-nay", seedPassword());
    await expect(page.locator("#login-error")).toHaveText(auth.errorInvalid);
    await expect(page).toHaveURL(/\/login/);
    await submitLogin(page, SEED_ACCOUNTS.studentAn.loginName, "definitely-not-the-password");
    await expect(page.locator("#login-error")).toHaveText(auth.errorInvalid);
    expect(await page.content()).not.toContain(emailFor("studentAn"));
  });
});
