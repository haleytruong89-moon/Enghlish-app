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
    // W4e (D36, replaces SM-2 P2-d): the child may see the NAME of a level the tutor confirmed, only on Hành trình (checked below); never an assumed level,
    // never a number level, never "đang học B2"-style sentences, and not on the home page.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(text).not.toContain(levelCopy.assumed);
    expect(await page.locator('[data-testid="levels-card"]').count()).toBe(0);
    // S7a: no skill level, no ⚑, no "waiting for confirmation" and no "app updated" note anywhere on the child's home.
    for (const s of ["SUPPORTED", "DEVELOPING", "INDEPENDENT", "TRANSFERABLE", "NEEDS_CONFIRMATION"] as const) expect(text, s).not.toContain(levelLabels[s].label);
    expect(text).not.toContain("⚑");
    expect(text).not.toContain(skillStateCopy.pending("").trim());
    expect(text).not.toContain(skillStateCopy.autoNote);
    expect(await page.locator('[data-testid="skill-scale"], [data-testid^="skill-row-"], [data-testid="review-tab-skills"], [data-testid^="transfer-mark"]').count()).toBe(0);
    // W4c2 / D39: the child's result screen, when present, never shows a ratio, a percentage, "điểm" or a count of right items (a practice work of a Studio
    // set may show ✓ / ✗, an answer and a "Vì sao" after a retry: those are not scores; the marks themselves are checked in studio.spec.ts).
    const review = page.locator('[data-testid="result-view"]');
    if (await review.count()) expect(await studentVisibleText(page, "result-view")).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|\bsai\s+\d/iu);
    // W4a: Hành trình shows counts of Units only: no %, no score, no level, no "đúng n".
    await page.goto("/journey");
    // PRD D35: a/b may appear only inside [data-count="work"] (counts of the child's own work); everything else is checked without them.
    const journey = await studentVisibleText(page);
    expect(journey).not.toMatch(SCORE_PATTERN);
    expect(journey).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/);
    expect(journey).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|\bsai\s+\d/iu);
    expect(journey).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(journey).not.toContain(levelCopy.assumed);
    // W4e: the level names are words (CEFR names) the tutor confirmed, with the tutor's name for it; an unconfirmed domain says so; never the Tư duy domain, never ⚑.
    if (await page.getByTestId("levels-card").count()) {
      const lv = await studentVisibleText(page, "levels-card");
      expect(lv).not.toContain(levelCopy.assumed);
      expect(lv).not.toMatch(/giả định|ước lượng|⚑|Tư duy|(^|\s)[1-4](\s|$)/i);
      await expect(page.getByTestId("level-tile-thinking")).toHaveCount(0);
      for (const tile of await page.locator('[data-testid^="level-name-"]').all()) expect(((await tile.textContent()) ?? "").trim()).toMatch(/^(A1|A2|B1|B2|C1|C2)\+?$/);
    }
    expect(await page.locator('[data-testid^="mt-"]').evaluateAll((els) => els.every((e) => !/\d\s*\/\s*4\s*·/.test(e.getAttribute("aria-label") ?? "")))).toBe(true);
    // W4b (PRD D35): on every page of the child's desk a number like a/b may only sit inside [data-count="work"] (the child's own work: tasks, answered
    // questions, sent work); dates are <time> (or a weekday line) and are set aside. No %, no "đúng n" / "sai n".
    for (const path of ["/", "/seen", "/done", "/journey", "/goal"]) {
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
