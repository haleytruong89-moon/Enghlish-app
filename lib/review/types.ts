/** Shapes the S5 pages and routes work with (camelCase, already validated by shape.ts). */

export type ReviewRole = "tutor" | "parent";
export type Score = 0 | 1 | 2 | 3 | 4;

/** Inbox categories (plan decision 8): `tutor` = checkpoint / watched live; the rest follow the step. */
export const INBOX_CATEGORIES = ["tutor", "baseline", "independent", "practice"] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export type InboxItem = {
  episodeId: string;
  attemptId: string;
  learnerId: string;
  alias: string;
  isTest: boolean;
  titleVi: string;
  stepNo: number;
  activityType: string;
  mode: "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";
  purpose: string[];
  provenance: "in_app" | "pasted" | "tutor_live" | "manual_import";
  attemptNo: number;
  isFirstAttempt: boolean;
  submittedAt: string;
  restricted: boolean;
  category: InboxCategory;
  targetsTotal: number;
  targetsDecided: number;
  canDecide: boolean;
};

/** Inbox filters (applied in SQL). `todo` = not fully decided yet (the default); `done` = every skill decided. */
export const INBOX_FILTERS = ["todo", "tutor", "independent", "baseline", "practice", "done"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];
/** Cursor = the last row of the previous page. */
export type InboxCursor = { at: string; id: string };
export type InboxCounts = Record<InboxFilter, number> & { toDecide: number };
export type InboxPage = { items: InboxItem[]; next: InboxCursor | null; counts: InboxCounts };

export type ReviewDecision = {
  id: string;
  decision: "AGREE" | "MODIFY" | "INSUFFICIENT" | "REQUEST_MORE";
  finalScore: Score | null;
  finalNotObserved: boolean;
  validatorRole: ReviewRole;
  validatorName: string | null;
  reason: string | null;
  supersedesId: string | null;
  at: string;
  current: boolean;
  criteriaResults: Record<string, boolean> | null;
  rationale: string | null;
  blind: boolean | null;
};

export type ReviewCriterion = { id: string; checkVi: string; method: string; computable: boolean };

export type ReviewTarget = {
  key: string;
  isTarget: boolean;
  scorable: boolean;
  lockedReason: "not_a_skill" | "needs_live" | null;
  titleVi: string | null;
  dimensionNameVi: string | null;
  /** Rubric text per score "0".."4" (Vietnamese). */
  rubricVi: Record<string, string> | null;
  criteria: ReviewCriterion[];
  opportunityRule: string | null;
  decisions: ReviewDecision[];
  /** The decision that is not superseded (null = not decided yet). */
  current: ReviewDecision | null;
};

export type ReviewAssistance = {
  id: number | string;
  kind: string;
  detail: string | null;
  verification: "declared" | "observed" | "unknown" | string;
  affects: string[];
  at: string;
  note: string | null;
  byName: string | null;
};

export type ReviewKey = { itemId: string; kind: "answer" | "sealed" | "note"; answer: string | null; explanationVi: string | null };

export type AutoChecks = {
  total: number;
  checked: number;
  correct: number;
  items: Record<string, { kind: string; result: "correct" | "incorrect" | "blank" | "needs_person" }>;
};

export type ReviewEpisodeView = {
  episode: { id: string; restricted: boolean; observedDirectly: boolean; isFirstAttempt: boolean; facets: Record<string, boolean> };
  learner: { id: string; alias: string; trackId: "A" | "B"; isTest: boolean };
  viewer: { role: "tutor" | "parent"; canDecide: boolean; restricted: boolean };
  attempt: {
    id: string;
    attemptNo: number;
    mode: "PRACTICE" | "INDEPENDENT_CHECK" | "REVISION";
    provenance: InboxItem["provenance"];
    submittedAt: string;
    declaredAssistance: string[];
    recordedByName: string | null;
  };
  artifact: { kind: string; content: Record<string, unknown> } | null;
  activity: { id: string; stepNo: number; activityType: string; mode: string; purpose: string[]; timeMin: number | null };
  inquiry: { id: string; titleVi: string; bigQuestionEn: string | null; bigQuestionVi: string | null };
  step: { promptEn: string | null; items: { id: string; kind: string; stem: string; options: string[] }[] };
  sources: { id: string; title: string; modality: string }[];
  autoChecks: AutoChecks | null;
  keys: ReviewKey[];
  assistance: ReviewAssistance[];
  targets: ReviewTarget[];
  tech: { templateId: string; templateVersion: number; catalogueVersion: string | null; descriptorVersion: string | null; policyVersion: string | null };
};

export const SUPPORT_LEVELS = ["none", "light", "moderate", "heavy"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

export type LessonNoteView = {
  id: string;
  learnerId: string;
  tutorMemberId: string;
  sessionDate: string;
  goals: string | null;
  observed: string | null;
  supportLevel: SupportLevel;
  nextActions: string[];
  practisedTargetIds: string[];
  published: boolean;
  supersedesId: string | null;
  createdAt: string;
  /** false = a newer version replaced it. */
  current: boolean;
};

export const OFFLINE_ASSISTANCE = ["none", "notes", "dictionary", "asked_someone", "ai_outside", "unknown"] as const;
export const OFFLINE_PROVENANCE = ["tutor_live", "manual_import"] as const;
/** One limit for the note on observed support: the database column, eng_record_observed_support, the zod schema and the input all use it. */
export const SUPPORT_NOTE_MAX = 300;
export const SUPPORT_KINDS = ["tutor_prompt", "frame", "notes", "model_answer", "accessibility"] as const;
