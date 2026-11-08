/**
 * Database rows → views of the curriculum screens (zod; anything unexpected throws → 500, logged, instead of a half-right screen). Pure:
 * the Giáo trình cards (progress of the version in use) and one version for the review screen.
 */
import { z } from "zod";
import type { TocContext } from "./context";
import type { EditStats } from "./editStats";
import { curriculumProgress, type CurriculumProgress, type ProgressUnit, type UnitEventRow } from "./progress";
import { curriculumPayloadSchema, type CurriculumPayload } from "./schema";
import type { CurriculumIssue } from "./validate";
import { QUALITY, UNIT_STATUSES, VERSION_STATUSES, type Quality, type VersionStatus } from "./types";

/** A version still "extracting" this long after it was made is shown as failed ("timeout") — the background job is gone (route maxDuration 300 s). */
export const STALE_EXTRACTING_MS = 6 * 60_000;

const text = z.string();
const int = z.number().int();
const version = z.object({
  id: text,
  curriculum_id: text,
  learner_id: text,
  version: int,
  source: z.enum(["ai", "manual", "edit"]),
  status: z.enum(VERSION_STATUSES),
  payload: z.unknown(),
  ai_payload: z.unknown().nullable(),
  error_code: text.nullable(),
  updated_at: text,
  approved_at: text.nullable(),
  review: z.unknown().nullable(),
  created_at: text,
});
const curriculum = z.object({ id: text, learner_id: text, title: text, level_note: text.nullable() });
const reviewRecord = z.object({
  stats: z
    .object({ ai_rows: int, kept: int, edited: int, dropped: int, added: int, edited_pct: int, reasons: z.record(z.string(), int) })
    .nullable()
    .default(null),
  quality: z.enum(QUALITY).nullable().default(null),
  quality_note: text.nullable().default(null),
});
export type ReviewRecord = { stats: EditStats | null; quality: Quality | null; qualityNote: string | null };

export type VersionView = {
  id: string;
  curriculumId: string;
  learnerId: string;
  title: string;
  levelNote: string | null;
  version: number;
  source: "ai" | "manual" | "edit";
  status: VersionStatus;
  payload: CurriculumPayload;
  aiPayload: CurriculumPayload | null;
  errorCode: string | null;
  updatedAt: string;
  approvedAt: string | null;
  review: ReviewRecord | null;
  stale: boolean;
  /** Parent only (spec §8): what the AI calls of this version cost, USD. null for a tutor. */
  aiCostUsd: number | null;
};

/** eng store `version()` returns {version, curriculum, ai_cost_usd}. */
export function parseVersion(raw: unknown, opts: { showCost: boolean; now?: number }): VersionView {
  const r = z.object({ version, curriculum, ai_cost_usd: z.union([z.number(), z.string()]).transform(Number) }).parse(raw);
  const v = r.version;
  const rv = v.review === null ? null : reviewRecord.parse(v.review);
  return {
    id: v.id,
    curriculumId: v.curriculum_id,
    learnerId: v.learner_id,
    title: r.curriculum.title,
    levelNote: r.curriculum.level_note,
    version: v.version,
    source: v.source,
    status: v.status,
    payload: curriculumPayloadSchema.parse(v.payload),
    aiPayload: v.ai_payload === null ? null : curriculumPayloadSchema.parse(v.ai_payload),
    errorCode: v.error_code,
    updatedAt: v.updated_at,
    approvedAt: v.approved_at,
    review: rv === null ? null : { stats: rv.stats as EditStats | null, quality: rv.quality, qualityNote: rv.quality_note },
    stale: v.status === "extracting" && (opts.now ?? Date.now()) - Date.parse(v.created_at) > STALE_EXTRACTING_MS,
    aiCostUsd: opts.showCost ? r.ai_cost_usd : null,
  };
}

/** Body of GET /api/curricula/versions/:id and the data of the review page. */
export type VersionPageData = {
  version: VersionView;
  /** Track of the child (tags of the review screen). */
  track_id: string;
  context: TocContext;
  issues: CurriculumIssue[];
  rows_to_resolve: number;
  can_approve: boolean;
  is_tutor: boolean;
  stats: EditStats | null;
};

// ---- Cards of the Giáo trình page -------------------------------------------------------------------------------------------------
const cardRows = z.object({
  curricula: z.array(z.object({ id: text, title: text, level_note: text.nullable(), created_at: text })),
  versions: z.array(z.object({ id: text, curriculum_id: text, version: int, status: z.enum(VERSION_STATUSES), error_code: text.nullable() })),
  units: z.array(z.object({ version_id: text, code: text, ord: int, title: text, section: text.nullable(), page: int.nullable(), skipped: z.boolean() })),
  points: z.array(z.object({ version_id: text, code: text, tag_key: text, ord: int })),
  events: z.array(z.object({ id: text, curriculum_id: text, unit_code: text, status: z.enum(UNIT_STATUSES), created_at: text })),
});
export type CardUnit = ProgressUnit & { section: string | null; page: number | null; points: string[] };
export type CurriculumCard = {
  id: string;
  title: string;
  levelNote: string | null;
  /** The approved version in use, or null (nothing approved yet). */
  current: { versionId: string; version: number; units: CardUnit[] } | null;
  progress: CurriculumProgress | null;
  /** A draft being read / reviewed (one at most). */
  open: { versionId: string; version: number; status: VersionStatus; errorCode: string | null } | null;
  events: UnitEventRow[];
};

export function buildCards(raw: unknown): CurriculumCard[] {
  const r = cardRows.parse(raw);
  return [...r.curricula]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((c) => {
      const versions = r.versions.filter((v) => v.curriculum_id === c.id);
      const cur = versions.find((v) => v.status === "approved") ?? null;
      const open = versions.find((v) => v.status === "extracting" || v.status === "ai_failed" || v.status === "draft") ?? null;
      const events: UnitEventRow[] = r.events
        .filter((e) => e.curriculum_id === c.id)
        .map((e) => ({ unitCode: e.unit_code, status: e.status, at: e.created_at, id: e.id }));
      const units: CardUnit[] = cur
        ? r.units
            .filter((u) => u.version_id === cur.id)
            .sort((a, b) => a.ord - b.ord)
            .map((u) => ({
              code: u.code, ord: u.ord, title: u.title, skipped: u.skipped, section: u.section, page: u.page,
              points: r.points.filter((p) => p.version_id === cur.id && p.code === u.code).sort((a, b) => a.ord - b.ord).map((p) => p.tag_key),
            }))
        : [];
      return {
        id: c.id,
        title: c.title,
        levelNote: c.level_note,
        current: cur ? { versionId: cur.id, version: cur.version, units } : null,
        progress: cur ? curriculumProgress(units, events) : null,
        open: open ? { versionId: open.id, version: open.version, status: open.status, errorCode: open.error_code } : null,
        events,
      };
    });
}

/** "Unit đã dạy hôm nay" chooser: curricula with an approved version, their units (not skipped) and current statuses. */
export type TaughtChoice = { curriculumId: string; title: string; currentCode: string | null; units: { code: string; title: string; status: string }[]; statusOf: CurriculumProgress["statusOf"] };
export function taughtChoices(cards: CurriculumCard[]): TaughtChoice[] {
  return cards.flatMap((c) =>
    c.current && c.progress
      ? [{
          curriculumId: c.id,
          title: c.title,
          currentCode: c.progress.current?.code ?? null,
          units: c.current.units.filter((u) => !u.skipped && c.progress?.statusOf[u.code] !== "skipped").map((u) => ({ code: u.code, title: u.title, status: c.progress?.statusOf[u.code] ?? "not_started" })),
          statusOf: c.progress.statusOf,
        }]
      : [],
  );
}
