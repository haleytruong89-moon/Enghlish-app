/**
 * Curriculum (W2 · Giáo trình) constants shared by the server, the browser and the tests. Pure. Same limits as migration 0026.
 * Rules: docs/DOMAIN.md §3 tầng B, §4, §5.1, §6.
 */
export const UNIT_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const VERSION_STATUSES = ["extracting", "ai_failed", "draft", "approved", "superseded", "discarded"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export const OPEN_STATUSES: readonly VersionStatus[] = ["extracting", "ai_failed", "draft"];

/** Same rule as curriculum_units.code (0026): "U7", "U12", "X-STARTER". Stable across versions. */
export const UNIT_CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

export const CURRICULUM_LIMITS = {
  title: 160,
  levelNote: 200,
  units: 300,
  unitTitle: 160,
  section: 40,
  page: 3000,
  points: 12,
  missing: 5,
  missingText: 120,
  reason: 200,
  ignored: 100,
  ignoredLabel: 160,
  taughtPerNote: 6,
  qualityNote: 200,
} as const;

/** Where a draft row came from: the AI, typed by hand, or copied from the approved version ("Sửa mục lục"). */
export const UNIT_ORIGINS = ["ai", "manual", "kept"] as const;
export type UnitOrigin = (typeof UNIT_ORIGINS)[number];

/** Why the code (not the AI) asked for a second look at a row (spec §5 "câu AI không chắc"). "ai" = the AI itself asked. */
export const UNIT_FLAGS = ["ai", "unknown_point", "duplicate_code", "numbering_gap", "bad_number", "no_title"] as const;
export type UnitFlag = (typeof UNIT_FLAGS)[number];

/** Optional reason when the tutor edits or drops an AI row (DOMAIN §9.3, adapted to a table of contents). */
export const EDIT_REASONS = ["wrong_title_page", "wrong_points", "missing_points", "not_a_unit", "other"] as const;
export type EditReason = (typeof EDIT_REASONS)[number];

/** End-of-review rating (DOMAIN §9.3 "Tốt / Tạm / Phải sửa nhiều"). Optional. */
export const QUALITY = ["good", "ok", "needs_work"] as const;
export type Quality = (typeof QUALITY)[number];

/** Rows of the contents page that are not teaching units (Review, Progress Test, reference pages). */
export const IGNORED_REASONS = ["review", "test", "reference", "other"] as const;
export type IgnoredReason = (typeof IGNORED_REASONS)[number];

/** Spec §8: when the tutor has to edit more than this share of the AI rows, stop and fix the prompt first. */
export const EDIT_WARN_PCT = 20;
