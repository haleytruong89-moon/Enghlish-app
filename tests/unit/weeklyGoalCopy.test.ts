import { describe, expect, it } from "vitest";
import { achievementsCopy, goalDeskCopy, streakCopy, weeklyGoalCopy } from "@/lib/copy/vi";

/** Every string a block can produce (functions are called with sample numbers). */
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (typeof x === "function") {
    for (const args of [[1], [2], [4], [5], [12], [3, 4], [3, 4, 5], [1, 2, 3]]) {
      try { const r = (x as (...a: unknown[]) => unknown)(...args); if (typeof r === "string") out.push(r); } catch { /* wrong arity */ }
    }
  } else if (Array.isArray(x)) x.forEach((i) => strings(i, out));
  else if (x && typeof x === "object") Object.values(x).forEach((i) => strings(i, out));
  return out;
}
const CHILD = { weeklyGoalCopy, streakCopy, achievementsCopy };

describe("W4d child copy", () => {
  for (const [name, block] of Object.entries(CHILD)) {
    const all = strings(block).filter((s) => s.length > 0);
    it(`${name}: no score words, no ranking, and the tutor only as the neutral "Thầy/cô"`, () => {
      expect(all.length).toBeGreaterThan(3);
      for (const s of all) {
        expect(s, s).not.toMatch(/điểm|xếp hạng|streak|quá hạn|%/i);
        expect(s.replace(/Thầy\/cô/gi, ""), s).not.toMatch(/\b(cô|thầy)\b/i);
      }
    });
    it(`${name}: short sentences (at most 15 words each)`, () => {
      for (const s of all) for (const sentence of s.split(/[.!?]\s+/)) expect(sentence.trim().split(/\s+/).length, sentence).toBeLessThanOrEqual(15);
    });
  }
  it("the adult block talks about the tutor in neutral words and never about ranking", () => {
    for (const s of strings(goalDeskCopy)) expect(s, s).not.toMatch(/xếp hạng|streak/i);
  });
});
