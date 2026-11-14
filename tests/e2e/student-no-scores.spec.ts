import { expect, test } from "@playwright/test";
import { levelCopy, levelLabels, skillStateCopy } from "@/lib/copy/vi";
import { loginAs, type AccountKey } from "./helpers";

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
    const journey = await page.locator("body").innerText();
    expect(journey).not.toMatch(SCORE_PATTERN);
    expect(journey).not.toMatch(/%|\bđiểm\b|đúng\s+\d|\bsai\s+\d/i);
    expect(journey).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(journey).not.toContain(levelCopy.assumed);
    expect(await page.locator('[data-testid^="mt-"]').evaluateAll((els) => els.every((e) => !/\d\s*\/\s*4\s*·/.test(e.getAttribute("aria-label") ?? "")))).toBe(true);
    // S6: the child's revision pages (todo and seen) and the home box are checked in the S6 serial suite of review.spec.ts, on real data.
  });
}
