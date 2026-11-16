import { describe, expect, it } from "vitest";
import { candoCopy, levelsStudentCopy, thenNowCopy } from "@/lib/copy/vi";

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (typeof x === "function") {
    for (const args of [[1], [5], [12]]) {
      try { const r = (x as (...a: unknown[]) => unknown)(...args); if (typeof r === "string") out.push(r); } catch { /* wrong arity */ }
    }
  } else if (x && typeof x === "object") Object.values(x).forEach((i) => strings(i, out));
  return out;
}

describe("W4e child copy", () => {
  for (const [name, block] of Object.entries({ levelsStudentCopy, candoCopy, thenNowCopy })) {
    const all = strings(block).filter((s) => s.length > 0);
    it(`${name}: no score words, no ranking, the tutor only as the neutral "thầy/cô", short sentences`, () => {
      expect(all.length).toBeGreaterThan(3);
      for (const s of all) {
        expect(s, s).not.toMatch(/điểm|xếp hạng|streak|quá hạn|%|đạt|tốt nhất|giỏi/i);
        expect(s.replace(/Thầy\/cô/gi, ""), s).not.toMatch(/\b(cô|thầy)\b/i);
        for (const sentence of s.split(/[.!?]\s+/)) expect(sentence.trim().split(/\s+/).length, sentence).toBeLessThanOrEqual(15);
      }
    });
  }
});
