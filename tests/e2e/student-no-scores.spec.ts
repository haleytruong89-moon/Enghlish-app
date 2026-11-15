import { expect, test } from "@playwright/test";
import { levelCopy, levelLabels, skillStateCopy } from "@/lib/copy/vi";
import { loginAs, studentVisibleText, type AccountKey } from "./helpers";

// Students never see raw scores (CLAUDE.md, D28). formatScore() renders "3/4 · Đạt yêu cầu".
const SCORE_PATTERN = /\d\s*\/\s*4\s*·/;

for (const key of ["studentAn", "studentNguyen"] as AccountKey[]) {
  test(`${key}: no score text on student pages`, async ({ page }) => {
    await loginAs(page, key);
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
    expect(await page.content()).not.toMatch(SCORE_PATTERN);
    // SM-2 (P2-d): a student never sees a level, assumed or confirmed.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(text).not.toContain(levelCopy.assumed);
    // S7a: no skill level, no ⚑, no "waiting for confirmation" and no "app updated" note anywhere on the child's home.
    for (const s of ["SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE", "NEEDS_CONFIRMATION"] as const) expect(text, s).not.toContain(levelLabels[s].label);
    expect(text).not.toContain("⚑");
    expect(text).not.toContain(skillStateCopy.pending("").trim());
    expect(text).not.toContain(skillStateCopy.autoNote);
    expect(await page.locator('[data-testid="skill-scale"], [data-testid^="skill-row-"], [data-testid="review-tab-skills"], [data-testid^="transfer-mark"]').count()).toBe(0);
    // Studio B1: the child's review block, when present, never shows a ratio, a percentage or a count of right items.
    const review = page.locator('[data-testid="studio-review"]');
    if (await review.count()) expect(await review.innerText()).not.toMatch(/\d+\s*\/\s*\d+|%|đúng\s+\d/i);
    // W4a: Hành trình shows counts of Units only: no %, no score, no level, no "đúng n".
    await page.goto("/journey");
    // PRD D35: a/b may appear only inside [data-count="work"] (counts of the child's own work); everything else is checked without them.
    const journey = await studentVisibleText(page);
    expect(journey).not.toMatch(SCORE_PATTERN);
    expect(journey).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/);
    expect(journey).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|\bsai\s+\d/iu);
    expect(journey).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(journey).not.toContain(levelCopy.assumed);
    expect(await page.locator('[data-testid^="mt-"]').evaluateAll((els) => els.every((e) => !/\d\s*\/\s*4\s*·/.test(e.getAttribute("aria-label") ?? "")))).toBe(true);
    // W4b (PRD D35): on every page of the child's desk a number like a/b may only sit inside [data-count="work"] (the child's own work: tasks, answered
    // questions, sent work); dates are <time> (or a weekday line) and are set aside. No %, no "đúng n" / "sai n".
    for (const path of ["/", "/seen", "/done", "/journey"]) {
      await page.goto(path);
      await expect(page.getByTestId("student-nav")).toBeVisible();
      const text = await studentVisibleText(page);
      expect(text, path).not.toMatch(SCORE_PATTERN);
      expect(text, path).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/);
      expect(text, path).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|\bsai\s+\d|quá hạn|streak|xếp hạng/iu);
      expect(text, path).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
      expect(await page.content(), path).not.toMatch(/"verdict"|ref_key|tag_key/);
    }
    // The old "Bài luyện" page only redirects to Hôm nay.
    await page.goto("/practice");
    await expect(page).toHaveURL(/\/$/);
    // S6: the child's revision pages (todo and seen) and the home box are checked in the S6 serial suite of review.spec.ts, on real data.
  });
}
