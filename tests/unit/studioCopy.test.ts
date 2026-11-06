import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiSettingsCopy, studioCopy, studioErrors, studioInboxCopy, studioIssueText, studioStudentCopy, tutorHonorific } from "@/lib/copy/vi";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { ISSUE_CODES } from "@/lib/studio/validate";
import { aiFailedText, formatUsd, questionNumber } from "@/lib/studio/view";

/** Every string of a copy object, functions called with sample arguments. */
function strings(o: unknown): string[] {
  if (typeof o === "string") return [o];
  if (typeof o === "function") {
    const f = o as (...a: unknown[]) => unknown;
    const samples: unknown[][] = [[2, 8], [[2, 8]], ["An", 5, 8], ["$1.20", "$10.00"], [null]];
    return samples.flatMap((args) => {
      try {
        return strings(f(...args));
      } catch {
        return []; // a sample of the wrong type for this function
      }
    });
  }
  if (Array.isArray(o)) return o.flatMap(strings);
  if (o && typeof o === "object") return Object.values(o).flatMap(strings);
  return [];
}
const STANDALONE_TEACHER = /(?<![\p{L}/])(thầy|cô)(?![\p{L}/])/iu;

describe("Studio copy (UX_COPY_GUIDE §3.5)", () => {
  it("the child's review never has a score, a ratio, a count of right items or a percentage", () => {
    for (const s of strings(studioStudentCopy)) {
      expect(hasScoreWords(s), s).toBe(false);
      expect(s, s).not.toMatch(/\d+\s*\/\s*\d+|%|điểm|đúng\s+\d/i);
    }
  });
  it("the person who teaches is always 'thầy/cô'; never TOMO", () => {
    for (const s of strings({ studioCopy, studioStudentCopy, studioInboxCopy, aiSettingsCopy, studioErrors, studioIssueText })) {
      expect(s, s).not.toMatch(STANDALONE_TEACHER);
      expect(s, s).not.toMatch(/tomo/i);
    }
    expect(studioInboxCopy.tab).toBe(`Cần ${tutorHonorific} xem`);
  });
  it("every issue code has a text; the guide lists the main labels", () => {
    for (const c of ISSUE_CODES) expect(studioIssueText[c]).toBeTruthy();
    const guide = readFileSync(new URL("../../docs/UX_COPY_GUIDE.md", import.meta.url), "utf8");
    for (const s of [studioCopy.reviewTitle, studioCopy.onlyFlagged, studioCopy.partSkill, studioStudentCopy.title, studioStudentCopy.shouldBe, studioInboxCopy.tab, aiSettingsCopy.enable]) {
      expect(guide, s).toContain(s);
    }
  });
  it("view helpers", () => {
    expect(questionNumber("q12", 0)).toBe(12);
    expect(questionNumber("W4-R2", 3)).toBe(4);
    expect(formatUsd(1.2)).toBe("$1.20");
    expect(aiFailedText("timeout")).toBe(studioCopy.aiFailedReason.timeout);
    expect(aiFailedText("something_new")).toBe(studioCopy.aiFailedReason.ai_failed);
  });
});
