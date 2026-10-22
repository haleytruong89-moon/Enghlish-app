import { expect, test } from "@playwright/test";
import { levelCopy } from "@/lib/copy/vi";
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
    // S6: the child's revision pages carry no score, verdict or skill code either.
    const fb = await page.request.get("/api/student/feedback");
    if (fb.status() === 200) {
      const { items } = (await fb.json()) as { items: { activityId: string; state: string }[] };
      for (const it of items.filter((i) => i.state !== "note").slice(0, 3)) {
        await page.goto(`/activities/${it.activityId}`);
        expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
        expect(await page.content()).not.toMatch(/"verdict"|improved|not_yet|reason_ok|ref_key/);
      }
    }
  });
}
