/**
 * AI reading → strict payload. The AI only COPIES (student answer, key answer, tag); whether an answer is right is decided here, in code
 * (same normalisation as english.eng_norm_answer). Unsure (low confidence, nothing to compare) → "needs_person" ("Cần xem"). A tag outside
 * the closed list is dropped. Questions are identified by (part, n): a test whose parts each restart at 1 keeps every row. A (part, n) that appears
 * twice is NEVER dropped silently: both rows stay and both are "Cần xem" so the tutor decides. Rows run in paper order (part, then n). Pure.
 */
import { normAnswer } from "@/lib/studio/normalize";
import type { ReadContext } from "./context";
import type { AiRead } from "./schema";
import { IMPORT_LIMITS as L, type ReadItem, type ReadPayload, type ReadResult } from "./types";

const clip = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t.length > 0 ? t : null;
};

/** The key may list several accepted answers joined by " | ". */
export function gradeRead(student: string | null, key: string | null, confidence: "high" | "low"): ReadResult {
  if (confidence === "low") return "needs_person";
  if (key === null) return "needs_person";
  if (student === null) return "blank";
  const s = normAnswer(student);
  if (s === "") return "blank";
  const accepted = key.split("|").map(normAnswer).filter((a) => a !== "");
  if (accepted.length === 0) return "needs_person";
  return accepted.includes(s) ? "correct" : "incorrect";
}

/** Identity of a question on the paper. */
export const slot = (part: string, n: number): string => `${part}#${n}`;
/** "Part II" → 2, "B" → 0: numbers inside a part label sort numerically ("Part 2" before "Part 10"). */
const partNo = (part: string): number => {
  const d = part.replace(/\D/g, "");
  return d === "" ? 0 : Number(d);
};
/** Paper order: by part number, then part label, then question number; ties keep the order given. */
export function sortPaperOrder<T extends { part: string; n: number }>(rows: readonly T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => partNo(a.r.part) - partNo(b.r.part) || a.r.part.localeCompare(b.r.part) || a.r.n - b.r.n || a.i - b.i).map((x) => x.r);
}

export function normalizeRead(raw: AiRead, ctx: ReadContext): ReadPayload {
  const known = new Set(ctx.tags.map((t) => t.key));
  const partOf = (q: AiRead["questions"][number]) => clip(q.part, L.part) ?? "";
  const counts = new Map<string, number>();
  for (const q of raw.questions) counts.set(slot(partOf(q), q.n), (counts.get(slot(partOf(q), q.n)) ?? 0) + 1);
  const items: ReadItem[] = [];
  for (const q of raw.questions) {
    const student = clip(q.student_answer, L.answer);
    const key = clip(q.key_answer, L.answer);
    const twice = (counts.get(slot(partOf(q), q.n)) ?? 0) > 1;
    items.push({
      n: q.n,
      part: partOf(q),
      student_answer: student,
      key_answer: key,
      tag: q.tag && known.has(q.tag) ? q.tag : null,
      out_of_app: q.out_of_app,
      confidence: q.confidence,
      result: twice ? "needs_person" : gradeRead(student, key, q.confidence),
    });
  }
  return { items: sortPaperOrder(items) };
}
