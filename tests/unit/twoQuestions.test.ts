import { describe, expect, it } from "vitest";
import { answersToSend, canSend, missingParts } from "@/lib/practice/twoQuestions";

describe("Hai câu hỏi nhanh + what is missing", () => {
  it("nothing is chosen for the child: with no page and no answer, pages and both questions are missing", () => {
    expect(missingParts(0, { first: null, hint: null })).toEqual(["pages", "questions"]);
    expect(canSend(0, { first: null, hint: null })).toBe(false);
  });

  it("names the one question still open, and the pages", () => {
    expect(missingParts(2, { first: true, hint: null })).toEqual(["hint"]);
    expect(missingParts(2, { first: null, hint: false })).toEqual(["first"]);
    expect(missingParts(0, { first: true, hint: false })).toEqual(["pages"]);
  });

  it("Nộp turns on only when there is a page and both questions are answered, whatever the answers are", () => {
    for (const first of [true, false]) for (const hint of [true, false]) expect(canSend(1, { first, hint })).toBe(true);
    expect(canSend(1, { first: false, hint: null })).toBe(false);
  });

  it("builds the request fields: 'Làm lại' is retry, and the hint is always a real yes / no", () => {
    expect(answersToSend({ first: true, hint: false })).toEqual({ attempt: "first", used_hint: false });
    expect(answersToSend({ first: false, hint: true })).toEqual({ attempt: "retry", used_hint: true });
    expect(answersToSend({ first: true, hint: null })).toBeNull();
  });
});
