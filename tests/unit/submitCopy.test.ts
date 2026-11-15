import { describe, expect, it } from "vitest";
import { linkSubmitCopy, paperSubmitCopy, submissionFeedbackCopy, submitScreenCopy, tutorHonorific } from "@/lib/copy/vi";

const strings = (root: unknown): string[] => {
  const all: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(v);
    else if (typeof v === "function") {
      for (const args of [[1, 2, 3], [2], ["x", "y"], [["a", "b"]]]) {
        try {
          const r = (v as (...a: unknown[]) => unknown)(...args);
          if (typeof r === "string") all.push(r);
        } catch {
          /* wrong arguments for this one */
        }
      }
    } else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(root);
  return all;
};
const NO_HARDCODED_TUTOR = (s: string) => s.replace(new RegExp(tutorHonorific, "gi"), "").replace(/Thầy\/cô/g, "");

describe("W4c1 child copy (send screens)", () => {
  const all = [...strings(submitScreenCopy), ...strings(paperSubmitCopy), ...strings(linkSubmitCopy)];
  it("has the sentences of the plan, spoken to 'bạn'", () => {
    expect(all.length).toBeGreaterThan(50);
    expect(submitScreenCopy.firstQ).toBe("Bạn làm lần đầu?");
    expect(submitScreenCopy.hintQ).toBe("Bạn có xem gợi ý hoặc đáp án không?");
    expect(submitScreenCopy.errors.unreadable).toBe("Ảnh này chưa mở được, bạn chụp lại hoặc chọn ảnh khác.");
    expect(submitScreenCopy.missing([submitScreenCopy.missingPart.pages, submitScreenCopy.missingPart.questions])).toBe("Còn thiếu: ảnh bài làm · trả lời 2 câu hỏi");
    expect(paperSubmitCopy.tag).toBe("Đề giấy · chụp nộp");
    expect(paperSubmitCopy.step2Note).toContain("Trên iPad: bấm Chụp ảnh");
    expect(linkSubmitCopy.finishedNo).toBe("Chưa, làm tiếp sau");
    expect(linkSubmitCopy.notYetNote).toBe("Không sao. Việc này vẫn ở danh sách Hôm nay, bạn quay lại khi xong nhé.");
    expect(linkSubmitCopy.step3Locked).toBe("Mở được khi bạn chọn “Xong rồi”.");
    expect(submitScreenCopy.countPages(3)).toContain("3 trang");
  });
  it("no score, right / wrong, percentage, streak or ranking; the tutor is only 'thầy/cô'", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(/điểm|đúng|sai\b|%|streak|chuỗi|xếp hạng|thắng|chính xác|quá hạn|kỹ năng/i);
      expect(NO_HARDCODED_TUTOR(s), s).not.toMatch(/(^|[^\p{L}])(cô|thầy)(?!\p{L})/iu);
    }
  });
});

describe("W4c1 adult copy (feedback on a submission)", () => {
  it("explains that the child sees it at once and is not asked to send again; every error has a sentence", () => {
    expect(submissionFeedbackCopy.intro).toContain("Đã xem");
    expect(submissionFeedbackCopy.intro).toContain("giao bài mới");
    for (const code of ["empty_feedback", "score_words", "praise_too_long", "item_too_long", "items_invalid", "already_given", "already_superseded", "author_only", "submission_replaced", "feedback_unavailable", "conflict", "not_found"]) {
      expect(submissionFeedbackCopy.errors[code], code).toBeTruthy();
    }
    for (const s of strings(submissionFeedbackCopy)) expect(NO_HARDCODED_TUTOR(s), s).not.toMatch(/(^|[^\p{L}])(cô|thầy)(?!\p{L})/iu);
  });
});
