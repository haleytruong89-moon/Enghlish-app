import { describe, expect, it } from "vitest";
import { leakReasons, type LeakItem } from "@/lib/tutor/leak";

/** BO_TEST_GIA_SU_TIENG_ANH v0.1 · ca máy chủ S.6–S.10 (the code check that runs before Haiku), plus the false alarms G0 taught us to avoid. */
const A1: LeakItem = { kind: "gap", stem: "Tourists often visit the ____ to see paintings and sculptures by famous artists.", options: [], answers: ["art gallery", "art-gallery"] };
const A7: LeakItem = { kind: "gap", stem: "My house is ____ front of the post office.", options: [], answers: ["in"] };
const A8: LeakItem = { kind: "mcq", stem: "Which word has a different stress pattern?", options: ["A. temple", "B. museum", "C. palace", "D. statue"], answers: ["B"] };
const N1: LeakItem = { kind: "word_form", stem: "She has always been very ______ and prefers to solve problems on her own. (DEPEND)", options: [], answers: ["independent"] };
const N3: LeakItem = { kind: "transform", stem: "I regret not studying harder for the exam. → I ______ harder for the exam. (WISH)", options: [], answers: ["wish I had studied", "wish I'd studied"] };
const N6: LeakItem = { kind: "short", stem: "Each of the students have a different timetable.", options: [], answers: ["has"] };
const N8: LeakItem = { kind: "gap", stem: "She is very good ____ solving puzzles.", options: [], answers: ["at"] };

describe("S.6 G1: the answer, any case, with or without the hyphen", () => {
  it.each(["Is it the art gallery?", "Try Art Gallery.", "maybe art-gallery"])("%j leaks", (t) => expect(leakReasons(t, A1)).toContain("answer"));
  it("G2: a word of the answer the question does not show leaks ('art', 'gallery'); 'artists' (in the question) does not", () => {
    expect(leakReasons("Think of a place with the word art in it.", A1)).toContain("answer_part");
    expect(leakReasons("Which gallery?", A1)).toContain("answer_part");
    expect(leakReasons("Look at 'paintings and sculptures by famous artists'. Which place in the Places box shows only those?", A1)).toEqual([]);
    expect(leakReasons("A museum shows all kinds of things. Another place in the box shows only paintings and statues. Can you find it?", A1)).toEqual([]);
  });
});

describe("S.7 short answers: only next to the blank's words", () => {
  it("'inside', 'look in the word bank' are fine; 'in front' leaks", () => {
    expect(leakReasons("The house is inside the town. Look in the word bank of prepositions.", A7)).toEqual([]);
    expect(leakReasons("We say in front of.", A7)).toContain("answer_next_to_blank");
  });
  it("N.8: 'look at the word' is fine; 'good at' leaks", () => {
    expect(leakReasons("Look at the adjective good. Which preposition goes with it?", N8)).toEqual([]);
    expect(leakReasons("We say good at.", N8)).toContain("answer_next_to_blank");
  });
  it("N.6 (no blank): 'has' right after 'students' leaks; 'has' elsewhere does not", () => {
    expect(leakReasons("Each of the students has …", N6)).toContain("answer_next_to_blank");
    expect(leakReasons("What is the real subject of the verb? Is it one student or many?", N6)).toEqual([]);
  });
});

describe("S.8 G3: the right letter named as the answer", () => {
  it.each(["đáp án B", "chọn B", "(B)", "option B", "the answer is B"])("%j leaks", (t) => expect(leakReasons(t, A8)).toContain("answer_letter"));
  it.each(["đáp án đúng là B", "Đáp án là B nhé", "B đúng rồi", "it's B", "B is correct", "the right answer is B"])("%j leaks too (review 21/11)", (t) =>
    expect(leakReasons(t, A8)).toContain("answer_letter"));
  it("the article 'a' is never the letter A", () => {
    const A5: LeakItem = { kind: "mcq", stem: "The government should take steps to ______ the effects of pollution.", options: ["A. mitigate", "B. militate", "C. migrate", "D. motivate"], answers: ["A"] };
    expect(leakReasons("Your answer is a verb that means 'make less bad'. Which choice fits?", A5)).toEqual([]);
    expect(leakReasons("Pick a word that means 'make less bad'.", A5)).toEqual([]);
    expect(leakReasons("The answer is A.", A5)).toContain("answer_letter");
  });
  it("'B2 level', option text of a wrong choice and the method are fine; the right option's word leaks", () => {
    expect(leakReasons("At B2 level, count the syllables and say each word aloud. Where is the stress in 'temple'?", A8)).toEqual([]);
    expect(leakReasons("Say museum aloud.", A8)).toContain("answer");
  });
});

describe("S.9 transformations: three words of the answer that the question does not show", () => {
  it("'had studied harder' leaks; 'studying harder' (in the question) does not", () => {
    expect(leakReasons("You need: wish I had studied harder", N3)).toEqual(expect.arrayContaining(["answer"]));
    expect(leakReasons("Use 'I had studied harder'.", N3)).toContain("answer_phrase");
    expect(leakReasons("The sentence is about 'studying harder' in the past. With wish, go one tense back. Which tense?", N3)).toEqual([]);
  });
});

describe("S.10 word formation: the affix glued to the root", () => {
  it.each(["in + dependent", "in-dependent", "Start with independ…"])("%j leaks", (t) => expect(leakReasons(t, N1)).not.toEqual([]));
  it("a negative prefix in general, and the root itself, are fine", () => {
    expect(leakReasons("You need an adjective from DEPEND with a negative prefix. Which prefix makes 'not depending on others'?", N1)).toEqual([]);
  });
});
