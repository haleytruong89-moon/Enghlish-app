/**
 * The task text of a Studio test, one line per part: "Questions 3–5 · B · Word formation: Use the word in capitals." (English, like every
 * prompt_en). Built by buildStudioBuild; read here so the child sees, above each question, the instruction of its own part.
 * Tests approved before 21/11 have lines without "Questions …": they show as plain lines and no question gets a line of its own. Pure.
 */
export type PromptLine = { from: number | null; to: number | null; text: string };

const RANGE = /^Questions? (\d{1,3})(?:–(\d{1,3}))? · (.+)$/;

export function promptLines(prompt: string): PromptLine[] {
  return prompt
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = RANGE.exec(l);
      if (!m) return { from: null, to: null, text: l };
      const from = Number(m[1]);
      return { from, to: m[2] ? Number(m[2]) : from, text: m[3]! };
    });
}

/** The instruction of the part that holds question n, or null (old prompt, or a question of no listed part). */
export function instructionFor(prompt: string, n: number): string | null {
  return promptLines(prompt).find((l) => l.from !== null && l.to !== null && n >= l.from && n <= l.to)?.text ?? null;
}

/** "Questions 3–5" / "Question 7" (exercise content, English). */
export const rangeLabel = (from: number, to: number) => (from === to ? `Question ${from}` : `Questions ${from}–${to}`);
