/** Shared, framework-free types and rules for the student work screens (S4). */

export const ASSISTANCE_VALUES = ["none", "notes", "dictionary", "asked_someone", "ai_outside"] as const;
export type Assistance = (typeof ASSISTANCE_VALUES)[number];

export const PROVENANCE_VALUES = ["in_app", "pasted"] as const;
export type Provenance = (typeof PROVENANCE_VALUES)[number];

export type Mode = "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";

/** Activity types a student can do in the app in this slice (the rest stay on paper / with the tutor). */
export const APP_ACTIVITY_TYPES = ["ACT-SOURCE-QA", "ACT-WRITE"] as const;

export function isDoneInApp(activityType: string, mode: string): boolean {
  return (APP_ACTIVITY_TYPES as readonly string[]).includes(activityType) && mode !== "REVISION";
}

export type DraftContent = {
  text?: string;
  answers?: Record<string, string>;
  pasted?: boolean;
  assistance?: Assistance[];
};

export type SubmitContent = { text: string } | { answers: Record<string, string> };

export type ItemKind = "mcq" | "gap" | "word_form" | "transform" | "short" | "open";

export type HomeStep = {
  activityId: string;
  stepNo: number;
  activityType: string;
  mode: Mode;
  /** Only "delayed_check" / "transfer_check" are ever sent to a student. */
  purpose: string[];
  timeMin: number | null;
  /** Effective date (ISO yyyy-mm-dd) in Asia/Ho_Chi_Minh. */
  date: string;
  attempts: number;
};

export type HomeInquiry = {
  instanceId: string;
  titleVi: string;
  bigQuestionEn: string;
  bigQuestionVi: string;
  dueOn: string;
  steps: HomeStep[];
};

export type HomeView = { inquiries: HomeInquiry[] };

export type SourceView = {
  id: string;
  title: string;
  author: string | null;
  rightsNote: string | null;
  modality: "text" | "audio" | "video";
  url: string | null;
  /** Only for text sources. */
  text: string | null;
};

export type ItemView = { id: string; kind: ItemKind; stem: string; options: string[] };

export type ActivityView = {
  activityId: string;
  instanceId: string;
  stepNo: number;
  activityType: string;
  mode: Mode;
  purpose: string[];
  date: string;
  titleVi: string;
  bigQuestionEn: string;
  bigQuestionVi: string;
  shape: "text" | "answers";
  supported: boolean;
  canSubmit: boolean;
  step: { promptEn: string; timeMin: number | null; selfCheckVi: string[]; items: ItemView[] };
  attempts: { attemptNo: number; submittedAt: string; provenance: Provenance }[];
  draft: { content: DraftContent; revision: number; updatedAt: string } | null;
  sources: SourceView[];
};

export type Receipt = { attemptId: string; attemptNo: number; submittedAt: string; hash: string; replayed: boolean };
export type DraftReceipt = { revision: number; savedAt: string; otherTabChanged: boolean };
