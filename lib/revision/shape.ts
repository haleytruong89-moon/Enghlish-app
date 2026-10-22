/**
 * Parsers for what migration 0021 returns. Staff parsers map to camelCase. The CHILD's parsers are allowlists: zod objects drop every key
 * that is not listed, so a future column (a verdict, a leaf, an author) can never reach a child by accident. An unexpected shape throws → 500.
 */
import { z } from "zod";
import { ASSISTANCE_VALUES } from "@/lib/work/types";
import {
  MARK_CHOICES,
  VERDICTS,
  type FeedbackItem,
  type FeedbackPanelView,
  type MyActivityNote,
  type MyFeedbackItem,
  type MyRevisionView,
  type RevisionListItem,
  type RevisionView,
} from "./types";

const text = z.string();
const nullableText = z.string().nullable().optional().transform((v) => v ?? null);
const int = z.number().int();
const leaf = z.object({ kind: z.enum(["tag", "target"]), ref_key: text });
const item = z.object({ n: int, text, excerpt: nullableText, leaf: leaf.nullable().optional().transform((v) => v ?? null) });
const toItem = (i: z.infer<typeof item>): FeedbackItem => ({ n: i.n, text: i.text, excerpt: i.excerpt, leaf: i.leaf ? { kind: i.leaf.kind, refKey: i.leaf.ref_key } : null });

const panelSchema = z.object({
  eligible: z.boolean(),
  can_give: z.boolean(),
  text: nullableText,
  live: z
    .object({
      id: text, praise: text, items: z.array(item), requires_revision: z.boolean(), round: int, revision_activity_id: nullableText,
      author_name: nullableText, author_is_me: z.boolean(), created_at: text, editable: z.boolean(),
      revision_state: z.enum(["todo", "started", "submitted", "seen"]).nullable().optional().transform((v) => v ?? null),
      revision_episode_id: nullableText,
    })
    .nullable(),
  history: z.array(z.object({ id: text, praise: text, items: z.array(item), created_at: text, author_name: nullableText })),
});

export function parseFeedbackPanel(raw: unknown): FeedbackPanelView | null {
  if (raw === null || raw === undefined) return null;
  const r = panelSchema.parse(raw);
  return {
    eligible: r.eligible,
    canGive: r.can_give,
    text: r.text,
    live: r.live && {
      id: r.live.id, praise: r.live.praise, items: r.live.items.map(toItem), requiresRevision: r.live.requires_revision, round: r.live.round,
      revisionActivityId: r.live.revision_activity_id, authorName: r.live.author_name, authorIsMe: r.live.author_is_me, createdAt: r.live.created_at,
      editable: r.live.editable, revisionState: r.live.revision_state, revisionEpisodeId: r.live.revision_episode_id,
    },
    history: r.history.map((h) => ({ id: h.id, praise: h.praise, items: h.items.map(toItem), createdAt: h.created_at, authorName: h.author_name })),
  };
}

const viewSchema = z.object({
  attempt_id: text, episode_id: text, learner_id: text, alias: text, round: int, title_vi: text, submitted_at: text,
  before: z.object({ attempt_id: text, episode_id: nullableText, text, submitted_at: text }),
  after: z.object({ text }),
  feedback: z.object({ id: text, praise: text, items: z.array(item), author_name: nullableText, created_at: text }),
  marks: z.array(z.object({ n: int, choice: z.enum(MARK_CHOICES), reason: nullableText })),
  checks: z.array(z.object({ n: int, verdict: z.enum(VERDICTS), checker_name: nullableText, created_at: text })),
  closing: z.object({ note: nullableText, author_name: nullableText, created_at: text }).nullable(),
  next_round: z.object({ feedback_id: text, created_at: text }).nullable(),
  reason_required: z.boolean(),
  can_finish: z.boolean(),
  can_open_round2: z.boolean(),
});

export function parseRevisionView(raw: unknown): RevisionView | null {
  if (raw === null || raw === undefined) return null;
  const r = viewSchema.parse(raw);
  return {
    attemptId: r.attempt_id, episodeId: r.episode_id, learnerId: r.learner_id, alias: r.alias, round: r.round, titleVi: r.title_vi, submittedAt: r.submitted_at,
    before: { attemptId: r.before.attempt_id, episodeId: r.before.episode_id, text: r.before.text, submittedAt: r.before.submitted_at },
    after: { text: r.after.text },
    feedback: { id: r.feedback.id, praise: r.feedback.praise, items: r.feedback.items.map(toItem), authorName: r.feedback.author_name, createdAt: r.feedback.created_at },
    marks: r.marks.map((m) => ({ n: m.n, choice: m.choice, reason: m.reason })),
    checks: r.checks.map((c) => ({ n: c.n, verdict: c.verdict, checkerName: c.checker_name, createdAt: c.created_at })),
    closing: r.closing && { note: r.closing.note, authorName: r.closing.author_name, createdAt: r.closing.created_at },
    nextRound: r.next_round && { feedbackId: r.next_round.feedback_id, createdAt: r.next_round.created_at },
    reasonRequired: r.reason_required, canFinish: r.can_finish, canOpenRound2: r.can_open_round2,
  };
}

const listSchema = z.object({
  items: z.array(z.object({
    attempt_id: text, episode_id: text, title_vi: text, round: int, submitted_at: text, items_count: int, state: z.enum(["waiting", "done"]), good: int, not_yet: int,
  })),
});

export function parseRevisionList(raw: unknown): RevisionListItem[] {
  return listSchema.parse(raw ?? { items: [] }).items.map((x) => ({
    attemptId: x.attempt_id, episodeId: x.episode_id, titleVi: x.title_vi, round: x.round, submittedAt: x.submitted_at,
    itemsCount: x.items_count, state: x.state, good: x.good, notYet: x.not_yet,
  }));
}

// --- the child's side (allowlists) --------------------------------------------------------------------------------------------------
const childItem = z.object({ n: int, text, excerpt: nullableText });
const myFeedbackSchema = z.object({
  items: z.array(z.object({
    feedback_id: text, activity_id: text, title_vi: text, round: int, items_count: int, state: z.enum(["todo", "submitted", "seen", "note"]),
    seen_at: nullableText, closing_note: nullableText, praise: nullableText,
    notes: z.array(childItem).nullable().optional().transform((v) => v ?? null),
  })),
});

export function parseMyFeedback(raw: unknown): MyFeedbackItem[] {
  return myFeedbackSchema.parse(raw ?? { items: [] }).items.map((x) => ({
    feedbackId: x.feedback_id, activityId: x.activity_id, titleVi: x.title_vi, round: x.round, itemsCount: x.items_count, state: x.state,
    seenAt: x.seen_at, closingNote: x.closing_note, praise: x.praise,
    notes: x.notes && x.notes.map((n) => ({ n: n.n, text: n.text, excerpt: n.excerpt })),
  }));
}

const markDraft = z.object({ choice: z.enum(MARK_CHOICES).optional(), reason: z.string().optional() });
const myRevisionSchema = z.object({
  activity_id: text, instance_id: text, title_vi: text, big_question_en: nullableText, round: int, praise: text,
  items: z.array(childItem), old_text: text, reason_required: z.boolean(), state: z.enum(["todo", "submitted", "seen"]),
  submitted_at: nullableText, closing_note: nullableText,
  draft: z
    .object({
      content: z.object({
        text: z.string().optional(),
        marks: z.record(z.string(), markDraft).optional(),
        pasted: z.boolean().optional(),
        assistance: z.array(z.enum(ASSISTANCE_VALUES)).optional(),
      }),
      revision: int,
      updated_at: text,
    })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export function parseMyRevision(raw: unknown): MyRevisionView | null {
  if (raw === null || raw === undefined) return null;
  const r = myRevisionSchema.parse(raw);
  return {
    activityId: r.activity_id, instanceId: r.instance_id, titleVi: r.title_vi, bigQuestionEn: r.big_question_en, round: r.round, praise: r.praise,
    items: r.items.map((i) => ({ n: i.n, text: i.text, excerpt: i.excerpt })), oldText: r.old_text, reasonRequired: r.reason_required,
    state: r.state, submittedAt: r.submitted_at, closingNote: r.closing_note,
    draft: r.draft && {
      content: {
        ...(r.draft.content.text !== undefined ? { text: r.draft.content.text } : {}),
        ...(r.draft.content.marks ? { marks: r.draft.content.marks } : {}),
        ...(r.draft.content.pasted !== undefined ? { pasted: r.draft.content.pasted } : {}),
        ...(r.draft.content.assistance ? { assistance: r.draft.content.assistance } : {}),
      },
      revision: r.draft.revision,
      updatedAt: r.draft.updated_at,
    },
  };
}

const myActivityNoteSchema = z.object({ feedback_id: text, praise: text, notes: z.array(childItem) });

/** G4: the "Chỉ góp ý" note of one activity (allowlist like the other child parsers). */
export function parseMyActivityNote(raw: unknown): MyActivityNote | null {
  if (raw === null || raw === undefined) return null;
  const r = myActivityNoteSchema.parse(raw);
  return { feedbackId: r.feedback_id, praise: r.praise, notes: r.notes.map((n) => ({ n: n.n, text: n.text, excerpt: n.excerpt })) };
}
