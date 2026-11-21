import { describe, expect, it } from "vitest";
import { buildStudioBuild } from "@/lib/studio/buildTemplate";
import { addItem, addPart, moveToPart, numberingBroken, removeItem, removePart, renumber } from "@/lib/studio/editOps";
import type { StudioDraft, StudioItem } from "@/lib/studio/schema";
import { blockingIssues, validateDraft } from "@/lib/studio/validate";
import { CTX_B } from "./fixtures/studio";

const q = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
  n, part, kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
  tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null, ...over,
});
/** The shape of the tutor's file: M 1–3, N 4–5 (reading text P1), O 6–8, P 9–10. */
const DRAFT: StudioDraft = {
  parts: ["M", "N", "O", "P"].map((key) => ({ key, name: `${key} · Word formation`, instructions: `Do ${key}.` })),
  passages: [{ ref: "P1", title: "Einstein", text: "Text (1) ____" }],
  items: [q(1, "M"), q(2, "M"), q(3, "M"), q(4, "N", { passage_ref: "P1" }), q(5, "N", { passage_ref: "P1" }), q(6, "O"), q(7, "O"), q(8, "O"), q(9, "P"), q(10, "P")],
};
const numbers = (d: StudioDraft) => d.items.map((i) => `${i.part}${i.n}`).join(" ");
const stems = (d: StudioDraft) => d.items.map((i) => i.stem);
const fine = (d: StudioDraft) => expect(blockingIssues(validateDraft(d, CTX_B))).toEqual([]);

describe("Studio draft edit operations", () => {
  it("the tutor's case: whichever two parts are kept, the questions are 1..N and Duyệt is possible", () => {
    const keep = (keys: string[]) => DRAFT.parts.filter((p) => !keys.includes(p.key)).reduce((d, p) => removePart(d, p.key), DRAFT);
    const firstTwo = keep(["M", "N"]);
    expect(numbers(firstTwo)).toBe("M1 M2 M3 N4 N5");
    const lastTwo = keep(["O", "P"]);
    expect(numbers(lastTwo)).toBe("O1 O2 O3 P4 P5");
    expect(stems(lastTwo)).toEqual(["Sentence 6 ____.", "Sentence 7 ____.", "Sentence 8 ____.", "Sentence 9 ____.", "Sentence 10 ____."]);
    const apart = keep(["M", "O"]);
    expect(numbers(apart)).toBe("M1 M2 M3 O4 O5 O6");
    for (const d of [firstTwo, lastTwo, apart]) {
      expect(d.parts).toHaveLength(2);
      fine(d);
      const b = buildStudioBuild(d);
      expect(b.frame.total).toBe(d.items.length);
      expect(b.frame.parts.every((p) => p.from >= 1 && p.to <= b.frame.total && p.from <= p.to)).toBe(true);
      expect(b.template.items.map((i) => i.id)).toEqual(d.items.map((_, k) => `q${k + 1}`));
    }
    // the reading text of a removed part stays in the draft (the tutor may reuse it) but is not sent to the child
    expect(lastTwo.passages).toHaveLength(1);
    expect(buildStudioBuild(lastTwo).passages).toEqual([]);
  });

  it("removing one question closes the gap; nothing else changes", () => {
    const d = removeItem(DRAFT, DRAFT.items[1]!);
    expect(numbers(d)).toBe("M1 M2 N3 N4 O5 O6 O7 P8 P9");
    expect(d.items[1]).toEqual({ ...DRAFT.items[2], n: 2 });
    expect(d.parts).toBe(DRAFT.parts);
    expect(d.passages).toBe(DRAFT.passages);
    fine(d);
    expect(numbers(DRAFT)).toBe("M1 M2 M3 N4 N5 O6 O7 O8 P9 P10"); // the input is not mutated
  });

  it("a new question goes to the end of its part, not to the end of the test", () => {
    const d = addItem(DRAFT, "N");
    expect(numbers(d)).toBe("M1 M2 M3 N4 N5 N6 O7 O8 O9 P10 P11");
    expect(d.items[5]).toMatchObject({ n: 6, part: "N", stem: "", key: null, tag_key: null });
    const empty = addItem({ ...DRAFT, items: DRAFT.items.filter((i) => i.part !== "O") }, "O");
    expect(numbers(empty)).toBe("M1 M2 M3 N4 N5 O6 P7 P8");
  });

  it("a new part takes the first free letter, also after a part was removed", () => {
    const abc: StudioDraft = { ...DRAFT, parts: ["A", "B", "D"].map((key) => ({ key, name: key, instructions: "" })), items: [] };
    expect(addPart(abc).parts.map((p) => p.key)).toEqual(["A", "B", "D", "C"]);
    expect(addPart(DRAFT).parts.map((p) => p.key)).toEqual(["M", "N", "O", "P", "A"]);
    const d = addPart(addPart(abc));
    expect(new Set(d.parts.map((p) => p.key)).size).toBe(5);
  });

  it("moving a question to another part puts it at the end of that part", () => {
    const d = moveToPart(DRAFT, DRAFT.items[0]!, "O");
    expect(numbers(d)).toBe("M1 M2 N3 N4 O5 O6 O7 O8 P9 P10");
    expect(d.items[7]!.stem).toBe("Sentence 1 ____.");
    fine(d);
  });

  it("a draft with gaps or doubled numbers is put right by renumber; a clean one is left as it is", () => {
    expect(numberingBroken(DRAFT)).toBe(false);
    expect(renumber(DRAFT).items).toEqual(DRAFT.items);
    const odd: StudioDraft = { ...DRAFT, items: [q(7, "O"), q(2, "M"), q(2, "M", { stem: "second two" }), q(9, "P"), q(4, "X")] };
    expect(numberingBroken(odd)).toBe(true);
    const d = renumber(odd);
    expect(numbers(d)).toBe("M1 M2 O3 P4 X5"); // unknown part last (still flagged unknown_part by the validator)
    expect(d.items[1]!.stem).toBe("second two"); // same number: the order in the file decides
    expect(numberingBroken(d)).toBe(false);
  });
});
