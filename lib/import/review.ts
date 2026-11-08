/** Pure state of the review screen: the rows the tutor is editing, what is still open, and the body of the confirmation. */
import type { ConfirmRow } from "./schema";
import type { ReadItem, ReadResult } from "./types";

export type ReviewRow = {
  n: number;
  part: string;
  studentAnswer: string | null;
  keyAnswer: string | null;
  /** Closed-list key chosen by the AI or the tutor; "" = none yet. */
  tag: string;
  outOfApp: boolean;
  result: ReadResult;
  lowConfidence: boolean;
  dropped: boolean;
};

export function toReviewRows(items: readonly ReadItem[]): ReviewRow[] {
  return items.map((i) => ({
    n: i.n, part: i.part, studentAnswer: i.student_answer, keyAnswer: i.key_answer, tag: i.tag ?? "", outOfApp: i.out_of_app, result: i.result,
    lowConfidence: i.confidence === "low", dropped: false,
  }));
}

/** Rows that still block the confirmation: kept rows with no tag, or an in-app row still "Cần xem". */
export function isOpen(r: ReviewRow): boolean {
  if (r.dropped) return false;
  return r.tag === "" || (!r.outOfApp && r.result === "needs_person");
}
export const openCount = (rows: readonly ReviewRow[]): number => rows.filter(isOpen).length;

/** "Cần xem" first (still open), then by question number. */
export function sortForReview(rows: readonly ReviewRow[]): ReviewRow[] {
  return [...rows].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.n - b.n);
}

/** Counted answers as the tutor has marked them: only kept in-app rows that are Đúng or Sai. */
export function summaryOf(rows: readonly ReviewRow[]): { correct: number; counted: number } {
  const counted = rows.filter((r) => !r.dropped && !r.outOfApp && (r.result === "correct" || r.result === "incorrect"));
  return { correct: counted.filter((r) => r.result === "correct").length, counted: counted.length };
}

/** The body rows. A paper-only row carries "blank" (it is not counted). Call only when openCount is 0. */
export function toConfirmRows(rows: readonly ReviewRow[]): ConfirmRow[] {
  return rows
    .filter((r) => !r.dropped)
    .map((r) => ({
      n: r.n, part: r.part, student_answer: r.studentAnswer, key_answer: r.keyAnswer, tag: r.tag, out_of_app: r.outOfApp,
      result: r.outOfApp || r.result === "needs_person" ? "blank" : r.result,
    }));
}
