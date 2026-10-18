/** Shapes the S5b-1 PR B screens work with (camelCase, already validated by shape.ts). */
import type { SourceKey } from "./link";

export type StoredFile = { id: string; mime: string; bytes: number };

export type SubmissionView = {
  id: string;
  createdAt: string;
  attempt: "first" | "retry";
  /** null = not asked (a PDF has no Hint). */
  usedHint: boolean | null;
  linkUrl: string | null;
  byRole: "student" | "tutor" | "parent";
  files: StoredFile[];
};

/** One assignment as the tutor / parent sees it (from english.eng_assignment_overview). */
export type AssignmentView = {
  id: string;
  kind: "link" | "pdf";
  title: string;
  url: string | null;
  sourceKey: SourceKey | null;
  tagKeys: string[];
  dueOn: string | null;
  frameId: string | null;
  createdAt: string;
  retractedAt: string | null;
  file: StoredFile | null;
  answerFile: StoredFile | null;
  submission: SubmissionView | null;
  /** Id of the newest result recorded for this assignment, if any. */
  resultId: string | null;
};

/** One assignment as the STUDENT sees it (english.eng_my_practice): no tags, no frame, no result, no answer key. */
export type StudentPracticeItem = {
  assignmentId: string;
  kind: "link" | "pdf";
  title: string;
  sourceKey: SourceKey | null;
  url: string | null;
  hasFile: boolean;
  dueOn: string | null;
  assignedOn: string;
  /** The tutor has looked at it: the student can no longer change what was sent. */
  reviewed: boolean;
  submission: { submittedAt: string; attempt: "first" | "retry"; usedHint: boolean | null; fileCount: number; hasLink: boolean } | null;
};

/** "Việc cần ôn" + the tutor's message to the student (english.eng_my_review_points). */
export type ReviewPoints = {
  sessionDate: string;
  message: string | null;
  labels: string[];
};
