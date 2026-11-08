/** Parse eng_import_batch (migration 0027) into the view the screens and handlers use. Pure. */
import { z } from "zod";
import { batchPayloadSchema } from "./schema";
import { IMPORT_STATUSES, STALE_READING_MS, SUPPORT_LEVELS, type ImportStatus, type SupportLevel } from "./types";
import type { ReadPayload } from "./types";

const row = z.object({
  id: z.string(),
  learner_id: z.string(),
  track_id: z.string(),
  title: z.string(),
  taken_on: z.string(),
  support_level: z.enum(SUPPORT_LEVELS),
  status: z.enum(IMPORT_STATUSES),
  payload: z.unknown().nullable(),
  error_code: z.string().nullable(),
  work_file_id: z.string(),
  key_file_id: z.string(),
  allow_other: z.boolean(),
  template_id: z.string().nullable(),
  attempt_id: z.string().nullable(),
  updated_at: z.string(),
  created_at: z.string(),
  /** Last change (a retry puts the batch back to "reading": the clock restarts there, not at creation). */
  touched_at: z.string().optional(),
});

export type ImportView = {
  id: string;
  learnerId: string;
  trackId: string;
  title: string;
  takenOn: string;
  supportLevel: SupportLevel;
  status: ImportStatus;
  payload: ReadPayload | null;
  errorCode: string | null;
  workFileId: string;
  keyFileId: string;
  templateId: string | null;
  updatedAt: string;
  /** Still "reading" long after it started: the background job is presumed dead. */
  stale: boolean;
};

export function parseImport(raw: unknown, now: number = Date.now()): ImportView {
  const r = row.parse(raw);
  return {
    id: r.id, learnerId: r.learner_id, trackId: r.track_id, title: r.title, takenOn: r.taken_on, supportLevel: r.support_level, status: r.status,
    payload: r.payload === null || r.payload === undefined ? null : batchPayloadSchema.parse(r.payload),
    errorCode: r.error_code, workFileId: r.work_file_id, keyFileId: r.key_file_id, templateId: r.template_id, updatedAt: r.updated_at,
    stale: r.status === "reading" && now - Date.parse(r.touched_at ?? r.created_at) > STALE_READING_MS,
  };
}

/** Body of GET /api/imports/:id and the data of the review screen. */
export type ImportPageData = {
  import: ImportView;
  context: { tags: { key: string; label: string; domain: string | null; group: string | null; reading: boolean }[] };
  is_tutor: boolean;
};
