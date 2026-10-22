/** S6 · Góp ý cho con + Sửa bài: limits and shapes shared by screens, routes and parsers. The limits mirror migration 0021. */
import type { Assistance } from "@/lib/work/types";

export const PRAISE_MAX = 160;
export const ITEM_MAX = 200;
export const EXCERPT_MAX = 120;
export const CLOSING_MAX = 300;
export const REASON_MAX = 300;
export const MAX_ITEMS = 3;
export const MAX_ROUNDS = 2;
/** Revision steps the app adds after a template's steps are numbered 1001, 1002, … (migration 0021, D3). */
export const AUTO_REVISION_STEP_BASE = 1000;
/** "Thầy/cô đã xem bài sửa của bạn" and "Chỉ góp ý" notes stay on the child's home this many days (D10, D12; same number in eng_my_feedback). */
export const SEEN_DAYS = 14;

export const MARK_CHOICES = ["changed", "kept"] as const;
export type MarkChoice = (typeof MARK_CHOICES)[number];
export const VERDICTS = ["improved", "not_yet", "reason_ok"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The two verdicts that fit the child's choice (spec 3-a): Đã sửa → Cải thiện thật / Chưa; Giữ nguyên → Lý do hợp lý / Chưa. */
export function verdictsFor(choice: MarkChoice): readonly [Verdict, Verdict] {
  return choice === "changed" ? ["improved", "not_yet"] : ["reason_ok", "not_yet"];
}

export type Leaf = { kind: "tag" | "target"; refKey: string };
export type FeedbackItem = { n: number; text: string; excerpt: string | null; leaf: Leaf | null };
/** One item while the adult types it (excerpt "" = none). */
export type FeedbackDraftItem = { text: string; excerpt: string; leaf: Leaf | null };
export type RevisionState = "todo" | "started" | "submitted" | "seen";

export type LiveFeedback = {
  id: string;
  praise: string;
  items: FeedbackItem[];
  requiresRevision: boolean;
  round: number;
  revisionActivityId: string | null;
  authorName: string | null;
  authorIsMe: boolean;
  createdAt: string;
  /** "Sửa góp ý" is offered: the author, still allowed to review, and the child has not started (1-c). */
  editable: boolean;
  revisionState: RevisionState | null;
  revisionEpisodeId: string | null;
};

export type FeedbackPanelView = {
  /** In-app writing (D8). */
  eligible: boolean;
  /** This person may send new feedback now. */
  canGive: boolean;
  text: string | null;
  live: LiveFeedback | null;
  history: { id: string; praise: string; items: FeedbackItem[]; createdAt: string; authorName: string | null }[];
};

export type Mark = { n: number; choice: MarkChoice; reason: string | null };
export type Check = { n: number; verdict: Verdict; checkerName: string | null; createdAt: string };

export type RevisionView = {
  attemptId: string;
  episodeId: string;
  learnerId: string;
  alias: string;
  round: number;
  titleVi: string;
  submittedAt: string;
  before: { attemptId: string; episodeId: string | null; text: string; submittedAt: string };
  after: { text: string };
  feedback: { id: string; praise: string; items: FeedbackItem[]; authorName: string | null; createdAt: string };
  marks: Mark[];
  checks: Check[];
  closing: { note: string | null; authorName: string | null; createdAt: string } | null;
  nextRound: { feedbackId: string; createdAt: string } | null;
  reasonRequired: boolean;
  canFinish: boolean;
  canOpenRound2: boolean;
};

export type RevisionListItem = {
  attemptId: string;
  episodeId: string;
  titleVi: string;
  round: number;
  submittedAt: string;
  itemsCount: number;
  state: "waiting" | "done";
  /** Items judged "Cải thiện thật" or "Lý do hợp lý". */
  good: number;
  notYet: number;
};

/** What the child receives (eng_my_feedback / eng_my_revision): never a score, a verdict, a skill leaf or an author. */
export type MyFeedbackState = "todo" | "submitted" | "seen" | "note";
export type MyFeedbackItem = {
  feedbackId: string;
  activityId: string;
  titleVi: string;
  round: number;
  itemsCount: number;
  state: MyFeedbackState;
  seenAt: string | null;
  closingNote: string | null;
  /** Only for a "Chỉ góp ý" note. */
  praise: string | null;
  notes: { n: number; text: string; excerpt: string | null }[] | null;
};

export type MarkDraft = { choice?: MarkChoice; reason?: string };
export type RevisionDraftContent = { text?: string; marks?: Record<string, MarkDraft>; pasted?: boolean; assistance?: Assistance[] };

export type MyRevisionView = {
  activityId: string;
  instanceId: string;
  titleVi: string;
  bigQuestionEn: string | null;
  round: number;
  praise: string;
  items: { n: number; text: string; excerpt: string | null }[];
  oldText: string;
  reasonRequired: boolean;
  state: "todo" | "submitted" | "seen";
  submittedAt: string | null;
  closingNote: string | null;
  draft: { content: RevisionDraftContent; revision: number; updatedAt: string } | null;
};

/** A "Chỉ góp ý" note read on the page of its own activity (G4): praise + items, no expiry, no score, leaf or author. */
export type MyActivityNote = { feedbackId: string; praise: string; notes: { n: number; text: string; excerpt: string | null }[] };
