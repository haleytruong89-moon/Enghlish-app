import { expect, test } from "@playwright/test";
import { app, auth } from "@/lib/copy/vi";
import { emailFor, submitLogin } from "./helpers";

test.describe("login page", () => {
  test("renders the Vietnamese login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: auth.title })).toBeVisible();
    await expect(page.getByText(app.name, { exact: true })).toBeVisible();
    await expect(page.getByLabel(auth.email)).toBeVisible();
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
    await page.getByLabel(auth.email).fill(emailFor("studentAn"));
    await page.getByRole("button", { name: auth.submit, exact: true }).click();
    await expect(page.locator("#login-error")).toHaveText(auth.errorMissing);
  });
});
