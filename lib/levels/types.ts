/** SM-2 level profile (spec 2026-10-21 §3): shapes the staff screens and the student home work with (camelCase, parsed by shape.ts). */
import type { DomainKey } from "@/lib/skillmap/types";

export const EXAMS = ["KET", "PET", "FCE", "CAE", "CPE", "VAO10_MOCK", "SCHOOL", "OTHER"] as const;
export type Exam = (typeof EXAMS)[number];
export const LEVEL_KINDS = ["baseline", "level_up", "adjust"] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];
export type Scale = "cefr" | "task_level";

/** Same limits as migration 0020. */
export const REASON_MAX = 300;
export const NOTE_MAX = 300;
export const SCORE_MAX = 60;
/** An exam date may be at most this many days back (≈ 10 years; same number in eng_record_external_result). */
export const EXAM_DAYS_BACK = 3660;
/** Parent home box (D11). */
export const RECENT_DAYS = 30;
export const RECENT_MAX = 5;
/** Student home (D12; same limit in eng_my_review_by_domain). */
export const REVIEW_MAX = 3;

export type ExternalMark = { id: string; exam: Exam; takenOn: string; scoreText: string };

export type DomainLevel = {
  key: DomainKey;
  name: string;
  scale: Scale;
  /** CEFR step ("B1+") or task level ("2"): latest decision, else the track's assumed level. */
  current: string;
  assumed: string;
  status: "assumed" | "confirmed";
  lastKind: LevelKind | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** Newest external result that names this domain. */
  external: ExternalMark | null;
};

export type LevelHistoryRow = { id: string; domainKey: DomainKey; from: string; to: string; kind: LevelKind; reason: string | null; decidedAt: string; decidedBy: string | null };

/** What a correction replaced (A2): kept in the book, shown next to the new entry as "đã sửa". */
export type ReplacedResult = { id: string; exam: Exam; takenOn: string; scoreText: string; fileId: string | null };

export type ExternalResultRow = {
  id: string; exam: Exam; takenOn: string; scoreText: string; domains: DomainKey[]; note: string | null; fileId: string | null;
  recordedBy: string | null; recordedRole: "tutor" | "parent"; recordedAt: string;
  replaces: ReplacedResult | null;
};

export type LevelProfile = {
  mapId: string;
  trackId: string;
  domains: DomainLevel[];
  history: LevelHistoryRow[];
  externalResults: ExternalResultRow[];
  /** Current monthly reading reports: month + number of skills. Never their source (D10). */
  readingReports: { month: string; skills: number }[];
};

export type LevelChange = {
  id: string; domainKey: DomainKey; domainName: string; scale: Scale; from: string; to: string; kind: LevelKind; reason: string | null;
  decidedAt: string; decidedBy: string | null;
};
export type RecentChange = LevelChange & { learnerId: string; alias: string };

/** What the student's home may show: a label and its domain. Nothing else. */
export type ReviewItem = { domainKey: DomainKey | null; domainName: string | null; label: string };
