import { expect, test } from "@playwright/test";
import { loginAs, type AccountKey } from "./helpers";

// Students never see raw scores (CLAUDE.md, D28). formatScore() renders "3/4 · Đạt yêu cầu".
const SCORE_PATTERN = /\d\s*\/\s*4\s*·/;

for (const key of ["studentAn", "studentNguyen"] as AccountKey[]) {
  test(`${key}: no score text on student pages`, async ({ page }) => {
    await loginAs(page, key);
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
    expect(await page.content()).not.toMatch(SCORE_PATTERN);
  });
}
