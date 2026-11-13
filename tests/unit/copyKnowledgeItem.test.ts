import { describe, expect, it } from "vitest";
import * as vi_ from "@/lib/copy/vi";

const {
  assignPage, curriculumCopy, curriculumErrors, deskCopy, importCopy, levelCopy, pendingCopy, pointMapCopy, pointStateCopy, resultPage, sessionNotePage,
  skillMapCopy, studentReviewCopy, tagPicker, todayPage, weakPage, writingTags, purgePage, appFeedback, studioInboxCopy,
} = vi_;

// "điểm" meaning a number/score stays (UX round 2, V7); "điểm" meaning a knowledge point is now "mục kiến thức".
const SCORE_PHRASES = [
  /khởi điểm/gi, /ghi điểm nhanh/gi, /ghi thêm điểm nhanh/gi, /không ghi điểm/gi, /điểm \+ câu sai/gi, /điểm số/gi, /phiếu điểm/gi, /điểm theo phần/gi,
  /thang điểm/gi, /điểm do người chấm/gi, /điểm mạnh/gi, /điểm yếu ban đầu/gi,
];
const DIEM = /(?<![\p{L}])điểm(?![\p{L}])/iu;

/** Every string inside an object/array; functions are called with sample arguments (strings and numbers) and skipped when they need more. */
function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (typeof v === "function") {
    for (const args of [["x", "y", "z"], [2, 3, 4], ["x", 2, 3], [2, "x", "y"]] as unknown[][]) {
      try {
        const r = (v as (...a: unknown[]) => unknown)(...args);
        if (typeof r === "string") return [[path, r]];
        if (r && typeof r === "object") return strings(r, path);
      } catch {
        /* try the next sample */
      }
    }
    return [];
  }
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}
const stripScore = (t: string) => SCORE_PHRASES.reduce((acc, re) => acc.replace(re, ""), t);
const offenders = (name: string, v: unknown) => strings(v, name).filter(([, t]) => DIEM.test(stripScore(t))).map(([p, t]) => `${p}: ${t}`);

describe("'mục kiến thức' replaces 'điểm' for knowledge items (13/11)", () => {
  it("no 'điểm' left in the knowledge-item blocks except score phrases", () => {
    const bad = [
      ...offenders("todayPage", todayPage), ...offenders("sessionNotePage", sessionNotePage), ...offenders("weakPage", weakPage),
      ...offenders("writingTags", writingTags), ...offenders("assignPage", assignPage), ...offenders("curriculumCopy", curriculumCopy),
      ...offenders("curriculumErrors", curriculumErrors), ...offenders("pendingCopy", pendingCopy), ...offenders("pointStateCopy", pointStateCopy),
      ...offenders("pointMapCopy", pointMapCopy), ...offenders("tagPicker", tagPicker), ...offenders("studentReviewCopy", studentReviewCopy),
      ...offenders("deskCopy.attentionNone", deskCopy.attentionNone), ...offenders("importCopy.confirmed", importCopy.confirmed),
      ...offenders("resultPage.tagNone", resultPage.tagNone), ...offenders("resultPage.tagPick", resultPage.tagPick),
      ...offenders("resultPage.pendingIntro", resultPage.pendingIntro), ...offenders("resultPage.seeWeak", resultPage.seeWeak),
      ...offenders("resultPage.rules", resultPage.rules), ...offenders("skillMapCopy", skillMapCopy), ...offenders("appFeedback.screens.weak", appFeedback.screens.weak),
      ...offenders("purgePage", purgePage), ...offenders("studioInboxCopy", studioInboxCopy), ...offenders("levelCopy.solidCount", levelCopy.solidCount),
      ...offenders("levelCopy.noSkillsInDomain", levelCopy.noSkillsInDomain), ...offenders("levelCopy.weakTitle", levelCopy.weakTitle),
      ...offenders("levelCopy.weakNone", levelCopy.weakNone), ...offenders("levelCopy.weakMore", levelCopy.weakMore),
    ];
    expect(bad).toEqual([]);
  });

  it("specific keys have the approved wording", () => {
    expect(curriculumCopy.col.points).toBe("Unit này dạy mục kiến thức nào?");
    expect(resultPage.tagNone).toBe("— Chọn mục kiến thức —");
    expect(weakPage.link).toBe("Mục cần chú ý");
    expect(tagPicker.maxReached(3)).toBe("Đã chọn 3/3 (đủ). Bỏ một mục để chọn mục khác.");
    expect(tagPicker.search).toBe("Tìm mục kiến thức");
    expect(levelCopy.solidCount(2, 5)).toBe("2/5 kỹ năng đã vững");
    expect(pointStateCopy.sectionTitle).toBe("Mục kiến thức");
  });

  it("the words for scores are untouched", () => {
    expect(todayPage.resultAction).toBe("Ghi điểm nhanh (bài link)");
    expect(sessionNotePage.recordResult).toBe("Ghi điểm nhanh");
    expect(resultPage.partsTitle).toBe("Điểm theo phần");
  });

  it("what the child reads has no number and no 'điểm'", () => {
    expect(studentReviewCopy.intro).toBe("Ôn lại mấy mục này nhé.");
    for (const [, t] of strings(studentReviewCopy)) {
      expect(t).not.toMatch(/\d/);
      expect(DIEM.test(t)).toBe(false);
    }
  });
});
