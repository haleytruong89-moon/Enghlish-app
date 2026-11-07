import { describe, expect, it } from "vitest";
import { normalizeExtract } from "@/lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "@/lib/studio/schema";
import { blockingIssues, canApprove, validateDraft } from "@/lib/studio/validate";
import { CTX_B, FAKE_EXTRACT } from "./fixtures/studio";

const base = (): StudioDraft => normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), CTX_B);
const codes = (d: StudioDraft) => validateDraft(d, CTX_B).filter((i) => i.blocking).map((i) => `${i.n ?? "-"}:${i.code}`);
const withItem = (n: number, patch: Partial<StudioDraft["items"][number]>) => {
  const d = base();
  d.items = d.items.map((i) => (i.n === n ? { ...i, ...patch } : i));
  return d;
};

describe("validateDraft — what blocks Duyệt (spec §5.4, §6; plan P2)", () => {
  it("the fixture is blocked only by item 8 (closed item without key); filling it unblocks", () => {
    expect(codes(base())).toEqual(["8:missing_key"]);
    expect(canApprove(validateDraft(withItem(8, { key: "is said to be" }), CTX_B))).toBe(true);
  });

  it("each blocking rule", () => {
    expect(codes(withItem(1, { options: [{ letter: "A", text: "have" }] }))).toContain("1:mcq_options");
    expect(codes(withItem(1, { key: "E" }))).toContain("1:mcq_key");
    expect(codes(withItem(2, { tag_key: "not-a-tag" }))).toContain("2:unknown_tag");
    expect(codes(withItem(2, { tag_key: null }))).toContain("2:no_tag");
    expect(codes(withItem(4, { tag_key: "dang-tu" }))).toContain("4:two_tags");
    expect(codes(withItem(4, { reading_skill_key: "dang-tu", tag_key: null }))).toContain("4:unknown_tag");
    expect(codes(withItem(3, { target_id: "B-L1-TRANSFORM-W" }))).toContain("3:unknown_skill");
    expect(codes(withItem(1, { explanation_vi: "Câu này được 1 điểm" }))).toContain("1:score_words");
    expect(codes(withItem(4, { passage_ref: "P9" }))).toContain("4:unknown_passage");
    expect(codes(withItem(1, { stem: "  " }))).toContain("1:empty_stem");
    expect(codes(withItem(6, { options: [{ letter: "A", text: "x" }, { letter: "B", text: "y" }] }))).toContain("6:options_not_mcq");
  });

  it("numbering must be 1..N and each part one block; every item must sit in a known part", () => {
    expect(codes(withItem(9, { n: 10 }))).toContain("-:numbering");
    expect(codes(withItem(3, { part: "C" }))).toEqual(expect.arrayContaining(["-:part_not_contiguous"]));
    expect(codes(withItem(3, { part: "Z" }))).toContain("3:unknown_part");
  });

  it("paper-only items need a tag but no key, no skill check; a draft with only paper items is blocked", () => {
    expect(codes(withItem(9, { kind: "gap", key: null }))).not.toContain("9:missing_key");
    const d = withItem(8, { key: "is said to be" });
    d.items = d.items.map((i) => ({ ...i, out_of_app: true }));
    expect(codes(d)).toContain("-:no_app_items");
  });

  it("needs_review from the AI is shown but does not block", () => {
    const issues = validateDraft(withItem(8, { key: "is said to be" }), CTX_B);
    expect(blockingIssues(issues)).toEqual([]);
    expect(issues.some((i) => i.n === 8 && i.code === "ai_review" && !i.blocking)).toBe(true);
  });

  it("two parts with the same key, or two reading texts with the same ref, block Duyệt", () => {
    const d = withItem(8, { key: "is said to be" });
    expect(codes({ ...d, parts: [...d.parts, { ...d.parts[0]! }] })).toContain("-:duplicate_part");
    expect(codes({ ...d, passages: [...d.passages, { ...d.passages[0]! }] })).toContain("-:duplicate_passage");
    expect(codes(d)).not.toContain("-:duplicate_part");
  });
});
