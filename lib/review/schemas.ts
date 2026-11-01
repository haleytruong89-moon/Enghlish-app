/** Request bodies for the S5 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import { OFFLINE_ASSISTANCE, OFFLINE_PROVENANCE, SUPPORT_KINDS, SUPPORT_LEVELS, SUPPORT_NOTE_MAX } from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a calendar date");

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const clientId = z.string().min(8).max(100);

/** One skill score. A score 0..4 XOR `not_observed` (NULL is "no opportunity", never 0). */
const scoreItem = z
  .strictObject({
    target_id: z.string().min(1).max(100),
    score: z.number().int().min(0).max(4).nullable(),
    not_observed: z.boolean().default(false),
    criteria: z.record(z.string().min(1).max(40), z.boolean()).optional(),
    rationale: z.string().trim().max(2000).optional(),
  })
  .refine((i) => (i.score === null) === i.not_observed, {
    message: "give a score from 0 to 4, or mark 'no opportunity' - not both, not neither",
    path: ["score"],
  });

export const decisionsBodySchema = z.strictObject({
  client_id: clientId,
  items: z
    .array(scoreItem)
    .min(1)
    .max(30)
    .refine((items) => new Set(items.map((i) => i.target_id)).size === items.length, { message: "each skill can appear once" }),
});
export type DecisionsBody = z.infer<typeof decisionsBodySchema>;

export const modifyBodySchema = z
  .strictObject({
    client_id: clientId,
    score: z.number().int().min(0).max(4).nullable(),
    not_observed: z.boolean().default(false),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine((b) => (b.score === null) === b.not_observed, {
    message: "give a score from 0 to 4, or mark 'no opportunity' - not both, not neither",
    path: ["score"],
  });
export type ModifyBody = z.infer<typeof modifyBodySchema>;

/** G4 (S7a): the reviewer ticks / unticks "Bài này ở chủ đề / nguồn mới (vận dụng)". The database checks who may (D15) and which work. */
export const transferMarkBodySchema = z.strictObject({ value: z.boolean() });
export type TransferMarkBody = z.infer<typeof transferMarkBodySchema>;

export const supportBodySchema = z.strictObject({
  client_id: clientId.optional(),
  kind: z.enum(SUPPORT_KINDS),
  target_ids: z.array(z.string().min(1).max(100)).min(1).max(30),
  note: z.string().trim().max(SUPPORT_NOTE_MAX).optional(),
});
export type SupportBody = z.infer<typeof supportBodySchema>;

export const offlineBodySchema = z.strictObject({
  client_id: uuid,
  activity_id: uuid,
  provenance: z.enum(OFFLINE_PROVENANCE),
  text: z.string().trim().min(1).max(20000),
  duration_sec: z.number().int().min(0).max(7200).optional(),
  word_count: z.number().int().min(0).max(20000).optional(),
  session_date: isoDate,
  /** Why the work is dated before the inquiry was assigned (paper work only; the database allows up to 14 days before). */
  backdate_reason: z.string().trim().min(5).max(200).optional(),
  assistance: z
    .array(z.enum(OFFLINE_ASSISTANCE))
    .min(1)
    .max(5)
    .refine((a) => new Set(a).size === a.length, { message: "duplicate" })
    .refine((a) => !((a.includes("none") || a.includes("unknown")) && a.length > 1), {
      message: "'none' and 'unknown' stand alone",
    }),
});
export type OfflineBody = z.infer<typeof offlineBodySchema>;

export const noteBodySchema = z.strictObject({
  client_id: clientId,
  session_date: isoDate,
  goals: z.string().trim().max(1000).optional(),
  observed: z.string().trim().max(2000).optional(),
  support_level: z.enum(SUPPORT_LEVELS),
  next_actions: z.array(z.string().trim().max(200)).max(3),
  practised_target_ids: z.array(z.string().min(1).max(100)).max(30).default([]),
  published: z.boolean().default(false),
  supersedes_id: uuid.optional(),
});
export type NoteBody = z.infer<typeof noteBodySchema>;
