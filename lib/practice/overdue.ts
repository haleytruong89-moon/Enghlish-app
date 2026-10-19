import type { AssignmentView } from "./types";

/**
 * "Quá hạn" (D4, S5c): a practice assignment whose due date is before today (Asia/Ho_Chi_Minh, `today` as YYYY-MM-DD) and that the
 * student has not sent and nobody has recorded. Only a label for the tutor and the parent: it changes no score, blocks no submission, and
 * the student never sees it. A retracted assignment is never overdue; the due day itself is not yet late.
 */
export function isOverdue(a: Pick<AssignmentView, "dueOn" | "retractedAt" | "submission" | "resultId">, today: string): boolean {
  return a.dueOn !== null && a.dueOn < today && a.retractedAt === null && a.submission === null && a.resultId === null;
}
