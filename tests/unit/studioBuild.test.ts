import { describe, expect, it } from "vitest";
import { buildStudioBuild } from "@/lib/studio/buildTemplate";
import { normAnswer, normalizeExtract } from "@/lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "@/lib/studio/schema";
import { sortForReview, summarizeDraft } from "@/lib/studio/summary";
import { validateDraft } from "@/lib/studio/validate";
import { CTX_B, FAKE_EXTRACT } from "./fixtures/studio";

const draft = (): StudioDraft => normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), CTX_B);
const fixed = (): StudioDraft => {
  const d = draft();
  d.items = d.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i));
  return d;
};

describe("normalizeExtract (AI → draft)", () => {
  it("keeps the fixture, fills the reading item's skill from its tag's related target, sorts by n", () => {
    const d = draft();
    expect(d.items.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d.items.find((i) => i.n === 5)).toMatchObject({ reading_skill_key: "doc-inference", tag_key: null, target_id: "B-T2-ASSUME-R" });
    expect(d.items.find((i) => i.n === 8)).toMatchObject({ needs_review: true, key: null });
  });

  it("repairs what the model got wrong and says why", () => {
    const raw = aiExtractSchema.parse({
      parts: [{ key: "A", name: "A", instructions: "" }],
      passages: [],
      items: [
        { n: 2, part: "A", kind: "wordform", stem: "x (HAPPY)", key: "happiness", options: [{ letter: "a", text: "x" }], tag_key: "doc-main-idea" },
        { n: 1, part: "A", kind: "other", stem: "Write.", tag_key: "nope", target_id: "B-L1-TRANSFORM-W", explanation_vi: "Được 2 điểm" },
        { n: 1, part: "A", kind: "mcq", stem: "dup" },
      ],
    });
    const d = normalizeExtract(raw, CTX_B);
    expect(d.items.map((i) => [i.n, i.kind])).toEqual([[1, "open"], [2, "word_form"]]);
    const [one, two] = d.items;
    expect(one).toMatchObject({ tag_key: null, target_id: null, explanation_vi: "", needs_review: true });
    expect(two).toMatchObject({ options: [], reading_skill_key: "doc-main-idea", tag_key: null, needs_review: true });
  });

  it("normAnswer mirrors english.eng_norm_answer", () => {
    expect(normAnswer("  Wish I Could. ")).toBe("wish i could");
    expect(normAnswer("it’s fine!!")).toBe("it's fine");
  });
});

describe("buildStudioBuild (draft → template, keys, meta, paper frame)", () => {
  it("in-app items become q<n> items without answers; paper-only items only reach meta and the frame", () => {
    const b = buildStudioBuild(fixed());
    expect(b.template.items.map((i) => i.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"]);
    expect(b.template.items[0]).toEqual({ id: "q1", kind: "mcq", stem: "I wish I ____ more time to read.", options: ["A. have", "B. had", "C. will have", "D. am having"], target_id: null });
    expect(b.template.target_ids).toEqual(["B-L2-CLOZE", "B-T1-EXAM-R", "B-T2-ASSUME-R"]);
    expect(JSON.stringify(b.template)).not.toMatch(/"(answer|explanation_vi|text|body|transcript|prompt_vi|review_note)":/);
    expect(b.keys.find((k) => k.item_id === "q1")).toEqual({ item_id: "q1", kind: "answer", answer: "B", explanation_vi: "Sau wish (ước điều trái với hiện tại) dùng quá khứ đơn: had." });
    expect(b.keys.find((k) => k.item_id === "q8")?.answer).toBe("is said to be");
    expect(b.keys).toHaveLength(8);
    expect(b.meta).toHaveLength(9);
    expect(b.meta.find((m) => m.n === 9)).toEqual({ n: 9, part: "E", tag_key: "tu-vung-ngu-canh", reading_skill_key: null, out_of_app: true });
    expect(b.frame).toEqual({
      total: 9,
      parts: [
        { key: "A", name: "Part A — Grammar", from: 1, to: 3 },
        { key: "B", name: "Part B — Reading", from: 4, to: 5 },
        { key: "C", name: "Part C — Word formation", from: 6, to: 6 },
        { key: "D", name: "Part D — Sentence transformation", from: 7, to: 8 },
        { key: "E", name: "Part E — Picture", from: 9, to: 9 },
      ],
      items: b.meta.map((m) => ({ n: m.n, part: m.part, tag_key: m.tag_key ?? m.reading_skill_key })),
    });
    expect(b.passages.map((p) => p.ref)).toEqual(["P1"]);
    expect(b.template.time_min).toBe(8);
  });

  it("accepted answers join the key with ' / '; refuses a blocked draft", () => {
    const d = fixed();
    d.items = d.items.map((i) => (i.n === 7 ? { ...i, accepted: ["I wish I could"] } : i));
    expect(buildStudioBuild(d).keys.find((k) => k.item_id === "q7")?.answer).toBe("wish I could / I wish I could");
    expect(() => buildStudioBuild(draft())).toThrow("studio_build_blocked");
  });
});

describe("summarizeDraft / sortForReview (side panel of board 19)", () => {
  it("counts: app-checked, may need a person, counts for skills, signal only, paper only", () => {
    const d = fixed();
    expect(summarizeDraft(d, validateDraft(d, CTX_B))).toEqual({
      total: 9, inApp: 8, auto: 6, mayNeedPerson: 2, counted: 4, signalOnly: 4, paperOnly: 1, needsReview: 1, blocking: 0,
    });
  });
  it("items to look at come first", () => {
    const d = draft();
    expect(sortForReview(d.items, validateDraft(d, CTX_B)).map((i) => i.n)[0]).toBe(8);
  });
});
