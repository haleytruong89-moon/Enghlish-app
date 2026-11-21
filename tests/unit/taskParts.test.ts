import { describe, expect, it } from "vitest";
import { leadOf, partForItem, splitBanks, taskPartsFromRaw, type TaskPart } from "@/lib/studio/taskParts";

/**
 * E0 (21/11, "Bài tập 16/11/2026", 15 câu, 3 phần): the box above question 1 showed every part's instructions run together,
 * "Complete the sentences with a suitable place:" twice, and both word banks. Each question must show only its own part.
 */
const BUG: TaskPart[] = [
  { key: "A", name: "Complete the sentences with a suitable place:", instructions: "Complete the sentences with a suitable place:\nPlaces: museum, art gallery, library, zoo, stadium", items: ["q1", "q2", "q3", "q4", "q5"] },
  { key: "B", name: "B · Adjectives", instructions: "Choose the best adjective. Adjectives: noisy · quiet · crowded · peaceful", items: ["q6", "q7", "q8", "q9", "q10"] },
  { key: "C", name: "C", instructions: "Điền dạng đúng của từ trong ngoặc (adj/adv).", items: ["q11", "q12", "q13", "q14", "q15"] },
];

describe("each question shows only the lead of its own part", () => {
  it("question 1 → part A only: one instruction (not twice), the Places bank as chips, nothing from B or C", () => {
    const lead = leadOf(partForItem(BUG, "q1")!);
    expect(lead).toEqual({ title: null, text: "Complete the sentences with a suitable place:", banks: [{ label: "Places", words: ["museum", "art gallery", "library", "zoo", "stadium"] }] });
    expect(JSON.stringify(lead)).not.toMatch(/Adjectives|noisy|Điền dạng/);
  });
  it("a question of part 2 sees part 2 only; part 3 (no bank) gets plain text; the bare key is not a title", () => {
    expect(leadOf(partForItem(BUG, "q7")!)).toEqual({ title: "B · Adjectives", text: "Choose the best adjective.", banks: [{ label: "Adjectives", words: ["noisy", "quiet", "crowded", "peaceful"] }] });
    expect(leadOf(partForItem(BUG, "q15")!)).toEqual({ title: null, text: "Điền dạng đúng của từ trong ngoặc (adj/adv).", banks: [] });
    expect(partForItem(BUG, "q99")).toBeNull();
  });
  it("a title that only repeats the instruction (any case, a key prefix, punctuation) is dropped; a repeated sentence shows once", () => {
    expect(leadOf({ key: "D", name: "D · Choose the correct word", instructions: "Choose the correct word.", items: [] })).toMatchObject({ title: null, text: "Choose the correct word." });
    expect(leadOf({ key: "E", name: "E", instructions: "Write one word. Write one word.", items: [] })).toMatchObject({ title: null, text: "Write one word." });
    expect(leadOf({ key: "F", name: "F · Phrasal verbs · tr.115", instructions: "Write one word in each gap.", items: [] })).toMatchObject({ title: "F · Phrasal verbs · tr.115" });
  });
});

describe("word banks", () => {
  it("a 'Box:' list (· or ,), even two words; another label needs three short items; the list must end its line", () => {
    expect(splitBanks("Write a word from the box in each gap. Box: compensation · debit · deposit")).toEqual({ text: "Write a word from the box in each gap.", banks: [{ label: "Box", words: ["compensation", "debit", "deposit"] }] });
    expect(splitBanks("Use the word in capitals.\nBox: debt · share")).toEqual({ text: "Use the word in capitals.", banks: [{ label: "Box", words: ["debt", "share"] }] });
    expect(splitBanks("Note: do it now, quickly")).toEqual({ text: "Note: do it now, quickly", banks: [] });
    expect(splitBanks("Answer the questions.")).toEqual({ text: "Answer the questions.", banks: [] });
    // a long sentence after a colon is not a bank
    expect(splitBanks("Remember: when you finish the first part, go on to the second part, then check every answer").banks).toEqual([]);
  });
});

describe("taskPartsFromRaw (what eng_my_task_parts returns)", () => {
  it("parses rows and refuses anything else (null = fall back to the task text)", () => {
    expect(taskPartsFromRaw([{ key: "A", name: "A", instructions: "x", items: ["q1"] }])).toEqual([{ key: "A", name: "A", instructions: "x", items: ["q1"] }]);
    expect(taskPartsFromRaw(null)).toBeNull();
    expect(taskPartsFromRaw([])).toBeNull();
    expect(taskPartsFromRaw([{ key: "A" }])).toBeNull();
  });
});
