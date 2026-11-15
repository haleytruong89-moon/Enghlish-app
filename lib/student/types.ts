/** W4b · the child's desk (Hôm nay · Đã xem · Đã làm): framework-free shapes read through eng_my_today / eng_my_history / eng_my_seen (migration 0032). */

export type TaskKind = "app" | "topic" | "link" | "paper" | "revision";
export type OffLabel = "with_tutor" | "on_paper";

/** One thing the child has to do. Counts are about the child's own work only (items answered, never correct). */
export type Task = {
  kind: TaskKind;
  /** The step (app / topic / revision) the child opens at /activities/[id]; null for link / paper work. */
  activityId: string | null;
  /** The link / PDF assignment; null for work in the app. */
  assignmentId: string | null;
  stepNo: number | null;
  activityType: string | null;
  title: string;
  dueOn: string | null;
  opensOn: string;
  timeMin: number | null;
  /** false = a step the app cannot do yet (with the tutor / on paper): it is listed, never opened. */
  doable: boolean;
  /** A practice item (not a self-done check step): the only place the dimmed "Hỏi gia sư · Sắp có" slot may show. */
  practice: boolean;
  offLabel: OffLabel | null;
  hasDraft: boolean;
  draftAt: string | null;
  filled: number | null;
  total: number | null;
};

export type HistoryKind = TaskKind;

export type HistoryRow = {
  src: "attempt" | "submission";
  ref: string;
  activityId: string | null;
  assignmentId: string | null;
  title: string;
  kind: HistoryKind;
  stepNo: number | null;
  activityType: string | null;
  submittedAt: string;
  first: boolean;
  /** Link work only: whether the child said they used the hint. null = not asked. */
  usedHint: boolean | null;
  /** Written by an adult outside the app ("Thầy/cô ghi lại bài này"). */
  offline: boolean;
  seen: boolean;
};

export type FeedbackNote = { n: number; text: string; excerpt: string | null };
export type FeedbackState = "note" | "todo" | "closed" | "revised";

export type SeenRow = {
  ref: string;
  activityId: string | null;
  assignmentId: string | null;
  title: string;
  kind: HistoryKind;
  stepNo: number | null;
  activityType: string | null;
  submittedAt: string;
  seenAt: string;
  praise: string | null;
  notes: FeedbackNote[];
  state: FeedbackState | null;
  /** The revision step to open ("Sửa bài"), only while the child still has to revise. */
  revisionActivityId: string | null;
  closingNote: string | null;
};
