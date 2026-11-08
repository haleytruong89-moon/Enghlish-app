/**
 * AI reading → strict payload. The AI only COPIES (student answer, key answer, tag); whether an answer is right is decided here, in code
 * (same normalisation as english.eng_norm_answer). Unsure (low confidence, nothing to compare) → "needs_person" ("Cần xem"). A tag outside
 * the closed list is dropped. Duplicate question numbers keep the first. Pure.
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

export function normalizeRead(raw: AiRead, ctx: ReadContext): ReadPayload {
  const known = new Set(ctx.tags.map((t) => t.key));
  const seen = new Set<number>();
  const items: ReadItem[] = [];
  for (const q of raw.questions) {
    if (seen.has(q.n)) continue;
    seen.add(q.n);
    const student = clip(q.student_answer, L.answer);
    const key = clip(q.key_answer, L.answer);
    items.push({
      n: q.n,
      part: clip(q.part, L.part) ?? "",
      student_answer: student,
      key_answer: key,
      tag: q.tag && known.has(q.tag) ? q.tag : null,
      out_of_app: q.out_of_app,
      confidence: q.confidence,
      result: gradeRead(student, key, q.confidence),
    });
  }
  items.sort((a, b) => a.n - b.n);
  return { items };
}
