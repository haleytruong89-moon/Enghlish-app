/** Pure state of the review screen: the rows the tutor is editing, what is still open, and the body of the confirmation. */
import { gradeRead, slot, sortPaperOrder } from "./normalize";
import type { ConfirmRow } from "./schema";
import type { ReadItem, ReadResult } from "./types";

export type ReviewRow = {
  /** Position in the list (stable key of the row; (part, n) may repeat while the tutor still has to decide). */
  idx: number;
  /** Typed in by the tutor ("Thêm câu" / Soạn tay). */
  manual: boolean;
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
  /** The result before "Chỉ ở giấy" was ticked: unticking restores it. */
  prevResult?: ReadResult;
};

export function toReviewRows(items: readonly ReadItem[]): ReviewRow[] {
  return items.map((i, idx) => ({
    idx, manual: false, n: i.n, part: i.part, studentAnswer: i.student_answer, keyAnswer: i.key_answer, tag: i.tag ?? "", outOfApp: i.out_of_app, result: i.result,
    lowConfidence: i.confidence === "low", dropped: false,
  }));
}

/** Rows that still block the confirmation: kept rows with no tag, or an in-app row still "Cần xem". */
export function isOpen(r: ReviewRow, all: readonly ReviewRow[] = []): boolean {
  if (r.dropped) return false;
  if (isDuplicate(r, all)) return true;
  return r.tag === "" || (!r.outOfApp && r.result === "needs_person");
}
/** The same (part, n) twice among the kept rows: both stay "Cần xem" until the tutor drops one. */
export const isDuplicate = (r: ReviewRow, all: readonly ReviewRow[]): boolean =>
  !r.dropped && all.some((o) => o.idx !== r.idx && !o.dropped && slot(o.part.trim(), o.n) === slot(r.part.trim(), r.n));
export const openCount = (rows: readonly ReviewRow[]): number => rows.filter((r) => isOpen(r, rows)).length;

/** "Cần xem" first (still open), then by question number. */
export function sortForReview(rows: readonly ReviewRow[]): ReviewRow[] {
  const order = new Map(sortPaperOrder(rows).map((r, i) => [r.idx, i]));
  return [...rows].sort((a, b) => Number(isOpen(b, rows)) - Number(isOpen(a, rows)) || (order.get(a.idx) ?? 0) - (order.get(b.idx) ?? 0));
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

/** A row the tutor types in ("Thêm câu"): the result is compared in code like an AI row (never "Cần xem" unless there is no key). */
export function manualRow(idx: number, f: { n: number; part: string; studentAnswer: string; keyAnswer: string; tag: string; outOfApp: boolean }): ReviewRow {
  const clean = (s: string): string | null => (s.replace(/\s+/g, " ").trim() === "" ? null : s.replace(/\s+/g, " ").trim());
  const student = clean(f.studentAnswer);
  const key = clean(f.keyAnswer);
  return {
    idx, manual: true, n: f.n, part: f.part.trim(), studentAnswer: student, keyAnswer: key, tag: f.tag, outOfApp: f.outOfApp,
    result: f.outOfApp ? "blank" : gradeRead(student, key, "high"), lowConfidence: false, dropped: false,
    ...(f.outOfApp ? { prevResult: gradeRead(student, key, "high") } : {}),
  };
}

/** Test ids stay `n` while `n` is unique among the rows; otherwise `part-n`. */
export const rowTid = (r: ReviewRow, all: readonly ReviewRow[]): string => (all.filter((o) => o.n === r.n).length > 1 ? `${r.part || "x"}-${r.n}` : String(r.n));
