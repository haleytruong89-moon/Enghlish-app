/** Parse the jsonb of the 0020 read functions. zod strips unknown keys (except the student's list: strict); anything unexpected throws. */
import { z } from "zod";
import { DOMAIN_KEYS } from "@/lib/skillmap/types";
import { EXAMS, LEVEL_KINDS, REVIEW_MAX, type LevelChange, type LevelProfile, type ReviewItem } from "./types";

const scale = z.enum(["cefr", "task_level"]);
const domainKey = z.enum(DOMAIN_KEYS);
const kind = z.enum(LEVEL_KINDS);

const domainRow = z.object({
  key: domainKey,
  name_vi: z.string(),
  scale,
  assumed_level: z.string(),
  current_level: z.string(),
  status: z.enum(["assumed", "confirmed"]),
  last_kind: kind.nullable(),
  decided_at: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  external: z.object({ id: z.string(), exam: z.enum(EXAMS), taken_on: z.string(), score_text: z.string() }).nullable(),
});
const historyRow = z.object({
  id: z.string(), domain_key: domainKey, from_level: z.string(), to_level: z.string(), kind, reason: z.string().nullable(),
  decided_at: z.string(), decided_by_name: z.string().nullable(),
});
const externalRow = z.object({
  id: z.string(), exam: z.enum(EXAMS), taken_on: z.string(), score_text: z.string(), domains: z.array(domainKey), note: z.string().nullable(),
  file_id: z.string().nullable(), recorded_by_name: z.string().nullable(), recorded_role: z.enum(["tutor", "parent"]), recorded_at: z.string(),
  replaces: z.object({ id: z.string(), exam: z.enum(EXAMS), taken_on: z.string(), score_text: z.string(), file_id: z.string().nullable() }).nullable(),
});
const profileRow = z.object({
  map_id: z.string(),
  track_id: z.string(),
  domains: z.array(domainRow).length(7),
  history: z.array(historyRow),
  external_results: z.array(externalRow),
  reading_reports: z.array(z.object({ month: z.string(), skills: z.number().int().min(0) })),
});

export function parseLevelProfile(raw: unknown): LevelProfile {
  const p = profileRow.parse(raw);
  return {
    mapId: p.map_id,
    trackId: p.track_id,
    domains: p.domains.map((d) => ({
      key: d.key, name: d.name_vi, scale: d.scale, current: d.current_level, assumed: d.assumed_level, status: d.status, lastKind: d.last_kind,
      decidedAt: d.decided_at, decidedBy: d.decided_by_name,
      external: d.external ? { id: d.external.id, exam: d.external.exam, takenOn: d.external.taken_on, scoreText: d.external.score_text } : null,
    })),
    history: p.history.map((h) => ({
      id: h.id, domainKey: h.domain_key, from: h.from_level, to: h.to_level, kind: h.kind, reason: h.reason, decidedAt: h.decided_at, decidedBy: h.decided_by_name,
    })),
    externalResults: p.external_results.map((e) => ({
      id: e.id, exam: e.exam, takenOn: e.taken_on, scoreText: e.score_text, domains: e.domains, note: e.note, fileId: e.file_id,
      recordedBy: e.recorded_by_name, recordedRole: e.recorded_role, recordedAt: e.recorded_at,
      replaces: e.replaces ? { id: e.replaces.id, exam: e.replaces.exam, takenOn: e.replaces.taken_on, scoreText: e.replaces.score_text, fileId: e.replaces.file_id } : null,
    })),
    readingReports: p.reading_reports.map((r) => ({ month: r.month, skills: r.skills })),
  };
}

const changeRow = z.object({
  id: z.string(), domain_key: domainKey, domain_name: z.string().nullable(), scale: scale.nullable(), from_level: z.string(), to_level: z.string(),
  kind, reason: z.string().nullable(), decided_at: z.string(), decided_by_name: z.string().nullable(),
});

export function parseRecentChanges(raw: unknown): LevelChange[] {
  return z.object({ changes: z.array(changeRow) }).parse(raw).changes.map((c) => ({
    id: c.id, domainKey: c.domain_key, domainName: c.domain_name ?? c.domain_key, scale: c.scale ?? "cefr", from: c.from_level, to: c.to_level,
    kind: c.kind, reason: c.reason, decidedAt: c.decided_at, decidedBy: c.decided_by_name,
  }));
}

/** STRICT: if the database ever sends more than a label and a domain, the student's home must fail rather than show it. */
const reviewRow = z.strictObject({ domain_key: domainKey.nullable(), domain_name: z.string().nullable(), label: z.string().min(1) });

export function parseReviewByDomain(raw: unknown): ReviewItem[] {
  return z.strictObject({ items: z.array(reviewRow).max(REVIEW_MAX) }).parse(raw).items.map((r) => ({
    domainKey: r.domain_key, domainName: r.domain_name, label: r.label,
  }));
}
