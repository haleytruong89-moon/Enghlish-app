/**
 * W4c1 · "Hai câu hỏi nhanh" and what is still missing before "Nộp" turns on. Pure.
 * Both answers start EMPTY on the new screens: a child who skips the question does not get a silent "Có, lần đầu".
 */
export type TwoAnswers = { first: boolean | null; hint: boolean | null };
export type Missing = "pages" | "questions" | "first" | "hint";

/** What is missing, in the order the screen asks. Both questions open → one entry "questions". */
export function missingParts(pageCount: number, a: TwoAnswers): Missing[] {
  const out: Missing[] = [];
  if (pageCount < 1) out.push("pages");
  if (a.first === null && a.hint === null) out.push("questions");
  else if (a.first === null) out.push("first");
  else if (a.hint === null) out.push("hint");
  return out;
}

export const canSend = (pageCount: number, a: TwoAnswers): boolean => missingParts(pageCount, a).length === 0;

/** The body fields: first = true → "first"; used_hint is always a real yes / no. Returns null while anything is unanswered. */
export function answersToSend(a: TwoAnswers): { attempt: "first" | "retry"; used_hint: boolean } | null {
  return a.first === null || a.hint === null ? null : { attempt: a.first ? "first" : "retry", used_hint: a.hint };
}
