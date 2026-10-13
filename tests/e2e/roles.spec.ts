import { expect, test } from "@playwright/test";
import { app, auth, home, learnerWithTrack } from "@/lib/copy/vi";
import { loginAs, type AccountKey } from "./helpers";

const AN = "An (thử)";
const NGUYEN = "Nguyên (thử)";

test.describe("each account lands on the right home", () => {
  test("parent sees both learners with their track label", async ({ page }) => {
    await loginAs(page, "parent");
    await expect(page.getByRole("heading", { level: 1, name: home.parentTitle })).toBeVisible();
    await expect(page.getByText(home.parentSummary(2))).toBeVisible();
    await expect(page.getByText(learnerWithTrack(AN, "A"))).toBeVisible();
    await expect(page.getByText(learnerWithTrack(NGUYEN, "B"))).toBeVisible();
    await expect(page.getByText(app.testBadge)).toBeVisible();
  });

  const tutors: { key: AccountKey; own: string; ownTrack: "A" | "B"; other: string }[] = [
    { key: "tutorAn", own: AN, ownTrack: "A", other: NGUYEN },
    { key: "tutorNguyen", own: NGUYEN, ownTrack: "B", other: AN },
  ];
  for (const t of tutors) {
    test(`${t.key} sees only their own learner`, async ({ page }) => {
      await loginAs(page, t.key);
      await expect(page.getByRole("heading", { level: 1, name: home.tutorTitle })).toBeVisible();
      await expect(page.getByText(learnerWithTrack(t.own, t.ownTrack))).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(page.getByText(t.other)).toHaveCount(0);
    });
  }

  const students: { key: AccountKey; alias: string; other: string }[] = [
    { key: "studentAn", alias: AN, other: NGUYEN },
    { key: "studentNguyen", alias: NGUYEN, other: AN },
  ];
  for (const s of students) {
    test(`${s.key} gets the student greeting and no staff labels`, async ({ page }) => {
      await loginAs(page, s.key);
      await expect(page.getByRole("heading", { level: 1, name: home.studentGreeting(s.alias) })).toBeVisible();
      await expect(page.getByText(home.studentEmpty)).toBeVisible();
      // Track labels are staff-only (D28); the other child is never shown.
      await expect(page.getByText(/Track [AB]/)).toHaveCount(0);
      await expect(page.getByText(s.other)).toHaveCount(0);
    });
  }

  test("logout returns to the login page and closes the session", async ({ page }) => {
    await loginAs(page, "parent");
    await page.getByRole("button", { name: auth.signOut }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: auth.title })).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
