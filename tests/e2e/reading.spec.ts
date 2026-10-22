import { expect, test } from "@playwright/test";
import { readingPage } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs } from "./helpers";

// Studio 1A: monthly reading-skill report → "Kỹ năng đọc" on Điểm cần chú ý. Staff only.
test.describe.serial("Studio 1A reading skills", () => {
  test("Nguyên's tutor enters this month's report; the weak page shows 'Cần chú ý' and 'Chưa đủ dữ liệu'", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`);
    await expect(page.getByTestId("reading-q-doc-cause-effect")).toBeVisible();
    await expect(page.locator('[data-testid^="reading-q-"]')).toHaveCount(14);
    await page.getByTestId("reading-q-doc-cause-effect").fill("5");
    await page.getByTestId("reading-pct-doc-cause-effect").fill("40");
    await page.getByTestId("reading-q-doc-sequence").fill("1");
    await page.getByTestId("reading-pct-doc-sequence").fill("0");
    await page.getByTestId("reading-save").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${LEARNER_IDS.nguyen}/weak\\?domain=reading$`));
    await expect(page.getByTestId("reading-status-doc-cause-effect")).toHaveText(readingPage.status.weak!);
    await expect(page.getByTestId("reading-section")).not.toContainText(/TOMO/i);
    await expect(page.getByTestId("reading-status-doc-sequence")).toHaveText(readingPage.status.thin!);
  });

  test("the same month again opens as a correction and saves a new version", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`);
    await expect(page.getByTestId("reading-q-doc-cause-effect")).toHaveValue("5");
    await page.getByTestId("reading-pct-doc-cause-effect").fill("60");
    await page.getByTestId("reading-save").click();
    await expect(page.getByTestId("reading-status-doc-cause-effect")).toHaveText(readingPage.status.ok!);
  });

  test("An's form has the 6 skills; the other child's tutor and the student get 404", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/learners/${LEARNER_IDS.an}/reading/new`);
    await expect(page.locator('[data-testid^="reading-q-"]')).toHaveCount(6);
    expect((await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`))?.status()).toBe(404);
    const api = await page.request.post(`/api/learners/${LEARNER_IDS.nguyen}/reading-reports`, {
      data: { client_id: "e2e-reading-x1", month: "2026-10-01", rows: [{ tag_key: "doc-sequence", questions: 4, correct_pct: 50 }] },
    });
    expect(api.status()).toBe(404);
    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    expect((await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`))?.status()).toBe(404);
  });
});
