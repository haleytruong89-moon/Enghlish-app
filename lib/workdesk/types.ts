/** W1 workdesk (teaching notes, intake profile, app feedback): constants shared by the schemas, the loaders and the screens. Same limits as migration 0025. */
import type { DomainKey } from "@/lib/skillmap/types";

export const NOTE_FIELDS = ["focus", "explain", "errors", "avoid"] as const;
export type NoteField = (typeof NOTE_FIELDS)[number];
export const NOTE_MAX = 600;

export const FEEDBACK_KINDS = ["bug", "hard_to_use", "suggestion", "question"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_STATUSES = ["new", "in_progress", "done", "wont_do"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_TEXT_MAX = 1000;
export const FEEDBACK_SCREEN_MAX = 80;
export const FEEDBACK_REPLY_MAX = 600;

export const INTAKE_TEXT_MAX = 300;
export const INTAKE_GOALS_MAX = 10;

export type { DomainKey };

export type NoteEntry = { text: string; at: string; authorName: string };
export type TeachingNotesView = { fields: Record<NoteField, NoteEntry | null>; updatedAt: string | null };

export type IntakeView = {
  goals: { title: string; due: string | null }[];
  strengths: Partial<Record<DomainKey, string>>;
  weaknesses: Partial<Record<DomainKey, string>>;
  note: string;
  at: string;
  authorName: string;
};

export type AppFeedbackView = {
  id: string;
  kind: FeedbackKind;
  screen: string;
  text: string;
  byName: string;
  byRole: "tutor" | "parent";
  at: string;
  status: FeedbackStatus;
  reply: string | null;
  statusAt: string;
};
