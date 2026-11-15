/** Parsers for the desk reads (zod): the functions already return only what the child may see; strict picks drop anything else here as well. */
import { z } from "zod";
import type { FeedbackState, HistoryKind, HistoryPage, SeenRow, Task, TaskKind } from "./types";

const kind = z.enum(["app", "topic", "link", "paper", "revision"]);
const nullableStr = z.string().nullable().optional();
const nullableInt = z.number().int().nullable().optional();

const rawTask = z.object({
  kind,
  activity_id: nullableStr,
  assignment_id: nullableStr,
  step_no: nullableInt,
  activity_type: nullableStr,
  title: z.string().nullable().optional(),
  due_on: nullableStr,
  opens_on: nullableStr,
  time_min: nullableInt,
  doable: z.boolean(),
  practice: z.boolean().optional(),
  mode: z.enum(["PRACTICE", "INDEPENDENT_CHECK"]).nullable().optional(),
  purpose: z.array(z.string()).optional(),
  off_label: z.enum(["with_tutor", "on_paper"]).nullable().optional(),
  has_draft: z.boolean(),
  draft_at: nullableStr,
  items_filled: nullableInt,
  items_total: nullableInt,
});

export function parseToday(input: unknown): Task[] {
  const r = z.object({ items: z.array(rawTask) }).parse(input);
  return r.items.map((t) => ({
    kind: t.kind as TaskKind,
    activityId: t.activity_id ?? null,
    assignmentId: t.assignment_id ?? null,
    stepNo: t.step_no ?? null,
    activityType: t.activity_type ?? null,
    title: t.title ?? "",
    dueOn: t.due_on ?? null,
    opensOn: t.opens_on ?? "",
    timeMin: t.time_min ?? null,
    doable: t.doable,
    practice: t.practice ?? false,
    mode: t.mode ?? null,
    purpose: (t.purpose ?? []).filter((p) => p === "delayed_check" || p === "transfer_check"),
    offLabel: t.off_label ?? null,
    hasDraft: t.has_draft,
    draftAt: t.draft_at ?? null,
    filled: t.items_filled ?? null,
    total: t.items_total ?? null,
  }));
}

const rawRow = z.object({
  src: z.enum(["attempt", "submission"]),
  ref: z.string(),
  activity_id: nullableStr,
  assignment_id: nullableStr,
  title: z.string().nullable().optional(),
  kind,
  step_no: nullableInt,
  activity_type: nullableStr,
  submitted_at: z.string(),
});

export function parseHistory(input: unknown): HistoryPage {
  const r = z
    .object({
      total: z.number().int().optional(),
      waiting: z.number().int().optional(),
      items: z.array(rawRow.extend({ first: z.boolean().nullable().optional(), used_hint: z.boolean().nullable().optional(), offline: z.boolean().nullable().optional(), retracted: z.boolean().optional(), seen: z.boolean() })),
    })
    .parse(input);
  const rows = r.items.map((x) => ({
    src: x.src,
    ref: x.ref,
    activityId: x.activity_id ?? null,
    assignmentId: x.assignment_id ?? null,
    title: x.title ?? "",
    kind: x.kind as HistoryKind,
    stepNo: x.step_no ?? null,
    activityType: x.activity_type ?? null,
    submittedAt: x.submitted_at,
    first: x.first ?? true,
    usedHint: x.used_hint ?? null,
    offline: x.offline ?? false,
    retracted: x.retracted ?? false,
    seen: x.seen,
  }));
  return { rows, total: r.total ?? rows.length, waiting: r.waiting ?? rows.filter((x) => !x.seen).length };
}

export function parseSeen(input: unknown): SeenRow[] {
  const r = z
    .object({
      items: z.array(
        rawRow.extend({
          seen_at: z.string(),
          praise: nullableStr,
          notes: z.array(z.object({ n: z.number().int(), text: z.string(), excerpt: nullableStr })).nullable().optional(),
          fb_state: z.enum(["note", "todo", "closed", "revised"]).nullable().optional(),
          revision_activity_id: nullableStr,
          closing_note: nullableStr,
        }),
      ),
    })
    .parse(input);
  return r.items.map((x) => ({
    ref: x.ref,
    activityId: x.activity_id ?? null,
    assignmentId: x.assignment_id ?? null,
    title: x.title ?? "",
    kind: x.kind as HistoryKind,
    stepNo: x.step_no ?? null,
    activityType: x.activity_type ?? null,
    submittedAt: x.submitted_at,
    seenAt: x.seen_at,
    praise: x.praise ?? null,
    notes: (x.notes ?? []).map((n) => ({ n: n.n, text: n.text, excerpt: n.excerpt ?? null })),
    state: (x.fb_state ?? null) as FeedbackState | null,
    revisionActivityId: x.revision_activity_id ?? null,
    closingNote: x.closing_note ?? null,
  }));
}
