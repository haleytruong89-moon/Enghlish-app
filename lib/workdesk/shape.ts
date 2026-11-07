/**
 * Parse the rows the W1 screens read (RLS-guarded selects). zod strips unknown keys; anything unexpected throws (→ 500, logged)
 * rather than showing a half-right page. Names are not in these tables (no foreign key to members), so the loader passes a lookup.
 */
import { z } from "zod";
import { DOMAIN_KEYS } from "@/lib/skillmap/types";
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, NOTE_FIELDS, type AppFeedbackView, type IntakeView, type NoteField, type TeachingNotesView } from "./types";

export type NameLookup = (memberId: string) => string;

const noteRow = z.object({ field: z.enum(NOTE_FIELDS), text: z.string(), author_member: z.string(), created_at: z.string() });

/** Newest row per field wins; a field never written (or cleared to an empty text) is null. */
export function parseTeachingNotes(raw: unknown, nameOf: NameLookup): TeachingNotesView {
  const rows = z.array(noteRow).parse(raw ?? []);
  const newest = new Map<NoteField, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = newest.get(r.field);
    if (!cur || r.created_at > cur.created_at) newest.set(r.field, r);
  }
  const fields = {} as TeachingNotesView["fields"];
  let updatedAt: string | null = null;
  for (const f of NOTE_FIELDS) {
    const r = newest.get(f);
    fields[f] = r && r.text.trim().length > 0 ? { text: r.text, at: r.created_at, authorName: nameOf(r.author_member) } : null;
    if (r && (updatedAt === null || r.created_at > updatedAt)) updatedAt = r.created_at;
  }
  return { fields, updatedAt };
}

const byDomain = z.record(z.string(), z.string()).optional().default({});
const intakeRow = z.object({
  content: z.object({
    goals: z.array(z.object({ title: z.string(), due: z.string().nullable().optional().transform((v) => v ?? null) })).optional().default([]),
    strengths: byDomain,
    weaknesses: byDomain,
    note: z.string().optional().default(""),
  }),
  author_member: z.string(),
  created_at: z.string(),
});

const onlyDomains = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k, v]) => (DOMAIN_KEYS as readonly string[]).includes(k) && v.length > 0));

/** The newest intake row of a child, or null when none was written. */
export function parseIntake(raw: unknown, nameOf: NameLookup): IntakeView | null {
  const rows = z.array(intakeRow).parse(raw ?? []);
  if (rows.length === 0) return null;
  const r = rows.reduce((a, b) => (b.created_at > a.created_at ? b : a));
  return {
    goals: r.content.goals,
    strengths: onlyDomains(r.content.strengths),
    weaknesses: onlyDomains(r.content.weaknesses),
    note: r.content.note,
    at: r.created_at,
    authorName: nameOf(r.author_member),
  };
}

const feedbackRow = z.object({
  id: z.string(),
  kind: z.enum(FEEDBACK_KINDS),
  screen: z.string(),
  text: z.string(),
  by_member: z.string(),
  by_role: z.enum(["tutor", "parent"]),
  created_at: z.string(),
});
const eventRow = z.object({
  feedback_id: z.string(),
  status: z.enum(FEEDBACK_STATUSES),
  reply: z.string().nullable(),
  created_at: z.string(),
});

/** Latest event gives the status (and the latest reply, if any); "new" first, then newest first. */
export function parseFeedback(rawFeedback: unknown, rawEvents: unknown, nameOf: NameLookup): AppFeedbackView[] {
  const fbs = z.array(feedbackRow).parse(rawFeedback ?? []);
  const events = z.array(eventRow).parse(rawEvents ?? []);
  const latest = new Map<string, (typeof events)[number]>();
  const reply = new Map<string, (typeof events)[number]>();
  for (const e of events) {
    const cur = latest.get(e.feedback_id);
    if (!cur || e.created_at > cur.created_at) latest.set(e.feedback_id, e);
    if (e.reply) {
      const rc = reply.get(e.feedback_id);
      if (!rc || e.created_at > rc.created_at) reply.set(e.feedback_id, e);
    }
  }
  const views = fbs.map((f): AppFeedbackView => {
    const ev = latest.get(f.id);
    return {
      id: f.id,
      kind: f.kind,
      screen: f.screen,
      text: f.text,
      byName: nameOf(f.by_member),
      byRole: f.by_role,
      at: f.created_at,
      status: ev?.status ?? "new",
      reply: reply.get(f.id)?.reply ?? null,
      statusAt: ev?.created_at ?? f.created_at,
    };
  });
  return views.sort((a, b) => Number(b.status === "new") - Number(a.status === "new") || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
