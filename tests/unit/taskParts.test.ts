import { describe, expect, it } from "vitest";
import { langOf, leadOf, partForItem, splitBanks, taskPartsFromRaw, type TaskPart } from "@/lib/studio/taskParts";

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
  it("a question of part 2 sees part 2 only (a title that is the bank's label is not repeated); part 3 (no bank) gets plain text; the bare key is not a title", () => {
    expect(leadOf(partForItem(BUG, "q7")!)).toEqual({ title: null, text: "Choose the best adjective.", banks: [{ label: "Adjectives", words: ["noisy", "quiet", "crowded", "peaceful"] }] });
    expect(leadOf(partForItem(BUG, "q15")!)).toEqual({ title: null, text: "Điền dạng đúng của từ trong ngoặc (adj/adv).", banks: [] });
    expect(partForItem(BUG, "q99")).toBeNull();
  });
  it("a title that only repeats the instruction (any case, a key prefix, punctuation) is dropped; a repeated sentence shows once", () => {
    expect(leadOf({ key: "D", name: "D · Choose the correct word", instructions: "Choose the correct word.", items: [] })).toMatchObject({ title: null, text: "Choose the correct word." });
    expect(leadOf({ key: "E", name: "E", instructions: "Write one word in each gap.\nWrite one word in each gap.", items: [] })).toMatchObject({ title: null, text: "Write one word in each gap." });
    expect(leadOf({ key: "G", name: "G · Complete the sentences", instructions: "Complete the sentences with a suitable place:", items: [] }).title).toBeNull();
    expect(leadOf({ key: "F", name: "F · Phrasal verbs · tr.115", instructions: "Write one word in each gap.", items: [] })).toMatchObject({ title: "F · Phrasal verbs · tr.115" });
  });
});

describe("the instruction is never rewritten (review 21/11)", () => {
  const text = (instructions: string, name = "A") => leadOf({ key: "A", name, instructions, items: [] }).text;
  it.each([
    ["Example: cat. Example: dog."],
    ["Question A: Yes. Question B: Yes."],
    ["Write the answers.\n1. ____\n2. ____"],
    ["e.g. happy → happily. e.g. quick → quickly"],
  ])("%j stays as written, line breaks included", (s) => expect(text(s)).toBe(s));
  it("an instruction written only in the name is shown as the instruction; a short code that is not the key stays in the title", () => {
    expect(leadOf({ key: "A", name: "Choose the correct word", instructions: "", items: [] })).toEqual({ title: null, text: "Choose the correct word", banks: [] });
    expect(leadOf({ key: "A", name: "TV: Watch and answer", instructions: "Answer the questions.", items: [] }).title).toBe("TV: Watch and answer");
  });
  it("Vietnamese text is marked vi, English en", () => {
    expect(langOf("Điền dạng đúng của từ trong ngoặc.")).toBe("vi");
    expect(langOf("Choose the correct word.")).toBe("en");
  });
});

describe("word banks", () => {
  it.each([
    "Write: one word, a number, or both",
    "Note: Use adj/adv/noun forms",
    "Time: 10 minutes, 2 parts, 15 questions",
    "Example: big, bigger, biggest",
    "Remember: when, where, who",
    "Options: A, B, C or D",
    "Use the word given in capitals: HAPPY",
    "Read the text: then answer, choose, check",
  ])("%j is not a word bank", (s) => expect(splitBanks(s)).toEqual({ text: s, banks: [] }));
  it("finds the bank after another label, drops one full stop, keeps 'and/or' whole, reads Vietnamese and capitalised labels", () => {
    expect(splitBanks("Directions: Use the words in the box. Box: a · b · c").banks).toEqual([{ label: "Box", words: ["a", "b", "c"] }]);
    expect(splitBanks("Note: complete the gaps. Box: debt · share")).toEqual({ text: "Note: complete the gaps.", banks: [{ label: "Box", words: ["debt", "share"] }] });
    expect(splitBanks("Places: museum, art gallery, library, zoo.").banks[0]!.words).toEqual(["museum", "art gallery", "library", "zoo"]);
    expect(splitBanks("Box: and/or, either/or").banks[0]!.words).toEqual(["and/or", "either/or"]);
    // Destination U17: two lettered boxes, one per line.
    expect(splitBanks("Box A: come · cut · prop").banks).toEqual([{ label: "Box A", words: ["come", "cut", "prop"] }]);
    expect(splitBanks("Box B: down · out · together · up").banks).toEqual([{ label: "Box B", words: ["down", "out", "together", "up"] }]);
    expect(splitBanks("Box C: in, off").banks).toEqual([{ label: "Box C", words: ["in", "off"] }]);
    expect(splitBanks("Complete with a verb from box A and a particle from box B.\nBox A: come · cut · prop\nBox B: down · out · together · up")).toEqual({
      text: "Complete with a verb from box A and a particle from box B.",
      banks: [{ label: "Box A", words: ["come", "cut", "prop"] }, { label: "Box B", words: ["down", "out", "together", "up"] }],
    });
    expect(splitBanks("Word Bank: run · swim · jump").banks[0]!.label).toBe("Word Bank");
    expect(splitBanks("Từ gợi ý: museum, zoo, park").banks[0]!.words).toEqual(["museum", "zoo", "park"]);
    expect(splitBanks("Fill the gaps with the words given. Choose from: tall, short, wide").banks[0]!.words).toEqual(["tall", "short", "wide"]);
  });
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

describe("word list in brackets (26/11, Destination U15 part E)", () => {
  it("a bracketed list closing a line about the box becomes chips; the instruction stays", () => {
    const t = "Complete with an appropriate comparative or superlative form of the words in the box. Add any other words you need. (demanding, few, funny, hard, long, observant, reliable, slight, ugly, valuable)";
    expect(splitBanks(t)).toEqual({
      text: "Complete with an appropriate comparative or superlative form of the words in the box. Add any other words you need.",
      banks: [{ label: "Box", words: ["demanding", "few", "funny", "hard", "long", "observant", "reliable", "slight", "ugly", "valuable"] }],
    });
  });
  it.each([
    "Complete the sentences using the words in the brackets. (see page 4)",
    "Write the answers (a, b or c).",
    "Read the text (about 200 words).",
    "Complete the sentences. (big, small, old)",
    // review 26/11: notes and option letters in brackets are not words to use
    "Complete with the words in the box (one word is extra, two are used twice).",
    "Choose the answer from the list (A, B or C).",
    "Use the words from the box (2 points each, 10 points in total)",
    "Complete with words in the box. (Use each word once, there is one extra)",
    "Use the words in the box (big, small)",
  ])("%j stays text", (s) => expect(splitBanks(s)).toEqual({ text: s, banks: [] }));
});
