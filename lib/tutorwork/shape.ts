/**
 * Parse what the database returns for the S5b-1 screens (jsonb from the eng_* functions, rows from RLS-guarded selects).
 * zod strips unknown keys; anything unexpected throws (→ 500, logged) rather than showing a half-right page.
 */
import { z } from "zod";
import type { FrameView, LastNote, RecentResult, ResultEdit, TagInfo, UntaggedItem, WeakPointsView } from "./types";

const text = z.string();
const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const int = z.number().int();
const source = z.enum(["test", "lesson", "writing", "practice"]);

const tagRow = z.object({
  key: text,
  label_vi: text,
  group_vi: nullableText,
  origin: z.enum(["seed", "custom"]),
});

export function parseTags(raw: unknown): TagInfo[] {
  return z
    .array(tagRow)
    .parse(raw ?? [])
    .map((t) => ({
      key: t.key,
      label: t.label_vi,
      group: t.group_vi,
      custom: t.origin === "custom",
    }));
}

const frameRow = z.object({
  id: text,
  title: text,
  total_items: int,
  parts: z.array(z.object({ key: text, name: text, from: int, to: int })),
  items: z.array(z.object({ n: int, part: text, tag_key: text })),
  scale: z
    .array(z.object({ min: int, max: int, label: text }))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export function parseFrames(raw: unknown): FrameView[] {
  return z
    .array(frameRow)
    .parse(raw ?? [])
    .map((f) => ({
      id: f.id,
      title: f.title,
      totalItems: f.total_items,
      parts: f.parts,
      items: [...f.items].sort((a, b) => a.n - b.n).map((i) => ({ n: i.n, part: i.part, tagKey: i.tag_key })),
      scale: f.scale,
    }));
}

const weakEvent = z.object({
  date: text,
  source,
  source_id: text,
  items: z.array(int).default([]),
  title: nullableText,
  used_hint: z.boolean().default(false),
  in_class: z.boolean().default(false),
});

const weakTag = z.object({
  tag_key: text,
  label_vi: text,
  group_vi: nullableText,
  sources: int,
  by_source: z.object({ test: int, practice: int, lesson: int, writing: int }),
  items_wrong: z.object({ test: int, practice: int }),
  asked_correct: z.object({ asked: int, wrong: int }),
  last_seen: nullableText,
  recheck_due_on: nullableText,
  recheck_due: z.boolean(),
  last_recheck: z
    .object({ result: z.enum(["ok", "still_wrong", "not_asked"]), on: text })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  status: z.enum(["repeat", "watch", "ok"]),
  events: z.array(weakEvent).default([]),
});

const weakPoints = z.object({
  policy_days: int
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  since: nullableText,
  today: text,
  tags: z.array(weakTag),
});

export function parseWeakPoints(raw: unknown): WeakPointsView {
  const w = weakPoints.parse(raw);
  return {
    policyDays: w.policy_days,
    since: w.since,
    today: w.today,
    tags: w.tags.map((t) => ({
      tagKey: t.tag_key,
      label: t.label_vi,
      group: t.group_vi,
      sources: t.sources,
      bySource: t.by_source,
      itemsWrong: t.items_wrong,
      asked: t.asked_correct.asked,
      askedWrong: t.asked_correct.wrong,
      lastSeen: t.last_seen,
      recheckDueOn: t.recheck_due_on,
      recheckDue: t.recheck_due,
      lastRecheck: t.last_recheck,
      status: t.status,
      events: t.events.map((e) => ({
        date: e.date,
        source: e.source,
        sourceId: e.source_id,
        items: e.items,
        title: e.title,
        usedHint: e.used_hint,
        inClass: e.in_class,
      })),
    })),
  };
}

const untagged = z.object({
  items: z.array(
    z.object({
      result_id: text,
      recorded_by_member: text,
      recorded_role: z.enum(["tutor", "parent"]),
      title: text,
      taken_on: text,
      created_at: text,
      source: z.enum(["test", "practice"]),
      used_hint: z.boolean(),
      in_class: z.boolean(),
      items: z.array(int),
    }),
  ),
});

export function parseUntagged(raw: unknown): UntaggedItem[] {
  return untagged.parse(raw ?? { items: [] }).items.map((i) => ({
    resultId: i.result_id,
    recordedByMember: i.recorded_by_member,
    recordedRole: i.recorded_role,
    title: i.title,
    takenOn: i.taken_on,
    createdAt: i.created_at,
    source: i.source,
    usedHint: i.used_hint,
    inClass: i.in_class,
    items: i.items,
  }));
}

const recentResult = z.object({
  id: text,
  title: nullableText,
  taken_on: text,
  total_items: int,
  correct: int,
});

const resultEditRow = z.object({
  id: text,
  mode: z.enum(["frame", "quick"]),
  frame_id: nullableText,
  context: z.enum(["home", "class"]),
  attempt: z.enum(["first", "retry"]),
  source: z.enum(["test", "practice"]),
  used_hint: z.boolean(),
  title: text,
  total_items: int,
  correct: int,
  wrong_items: z.array(int),
  item_tags: z.array(z.object({ n: int, tag_key: nullableText })),
  taken_on: text,
  assignment_id: nullableText,
});

export function parseResultEdit(raw: unknown): ResultEdit | null {
  if (raw === null || raw === undefined) return null;
  const r = resultEditRow.parse(raw);
  return {
    id: r.id,
    mode: r.mode,
    frameId: r.frame_id,
    context: r.context,
    attempt: r.attempt,
    source: r.source,
    usedHint: r.used_hint,
    title: r.title,
    total: r.total_items,
    correct: r.correct,
    wrongItems: [...r.wrong_items].sort((a, b) => a - b),
    itemTags: r.item_tags.map((t) => ({ n: t.n, tagKey: t.tag_key })),
    takenOn: r.taken_on,
    assignmentId: r.assignment_id,
  };
}

export function parseRecentResult(raw: unknown): RecentResult | null {
  const rows = z.array(recentResult).parse(raw ?? []);
  const r = rows[0];
  return r
    ? {
        id: r.id,
        title: r.title ?? "",
        takenOn: r.taken_on,
        total: r.total_items,
        correct: r.correct,
      }
    : null;
}

const noteRow = z.object({
  id: text,
  session_date: text,
  goals: nullableText,
  weak_tag_keys: z
    .array(text)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
  message_to_learner: nullableText,
  author_role: z
    .enum(["tutor", "parent"])
    .nullable()
    .optional()
    .transform((v) => v ?? "tutor"),
});

/** Newest first; `raw` may hold superseded versions - the caller passes only the rows it wants considered. */
export function parseLastNote(raw: unknown): LastNote | null {
  const rows = z.array(noteRow).parse(raw ?? []);
  const n = rows[0];
  return n
    ? {
        id: n.id,
        sessionDate: n.session_date,
        studied: n.goals,
        weakTagKeys: n.weak_tag_keys,
        message: n.message_to_learner,
        authorRole: n.author_role,
      }
    : null;
}
