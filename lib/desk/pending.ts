/**
 * "Chờ duyệt" of one child as one compact list (spec §3, §5 rule 4): every source that already waits for an adult, oldest first.
 * Pure. A row only LINKS to the page where the decision is made (DOMAIN R1, spec §3: no one-click approval) — it decides nothing.
 */
import { activityLabels, curriculumCopy, fallbackLabels, pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { PointInboxItem } from "@/lib/points/types";
import { pointTitle } from "@/lib/points/view";
import type { InboxItem } from "@/lib/review/types";
import type { SkillInboxItem } from "@/lib/skills/types";
import { proposalTitle } from "@/lib/skills/view";
import type { DraftListItem, PendingAttempt } from "@/lib/studio/types";

export const PENDING_GROUPS = ["all", "work", "check", "ai", "skills"] as const;
export type PendingGroup = (typeof PENDING_GROUPS)[number];
export type PendingKind = "work" | "studio_check" | "studio_draft" | "curriculum_draft" | "skill" | "point" | "flag";
export type PendingRow = { key: string; kind: PendingKind; group: Exclude<PendingGroup, "all">; label: string; title: string; since: string | null; need: string; href: string; waitingTutor: boolean };
export type PendingInput = {
  learnerId: string;
  role: "tutor" | "parent";
  work: readonly InboxItem[];
  studio: readonly PendingAttempt[];
  skills: readonly SkillInboxItem[];
  /** Knowledge-point proposals and ⚑ (W3); they only LINK to the "Kỹ năng" tab, where the child's tutor confirms one by one. */
  points?: readonly PointInboxItem[];
  /** Drafts of THIS child (loadDraftList is per child). */
  drafts: readonly DraftListItem[];
  /** Curricula of THIS child (loadCurriculumCards is per child). */
  curricula: readonly CurriculumCard[];
};
/**
 * The S5 inbox RPC has no learner filter and returns at most 100 rows (oldest first) across ALL the caller's children, so one
 * child's work is found by following the cursor. Bounded: after PENDING_MAX_PAGES pages we stop and say "there may be more".
 */
export const PENDING_PAGE_SIZE = 100;
export const PENDING_MAX_PAGES = 5;

export type PendingView = {
  /** "5", "≥ 5" or null (unknown: a source could not be read). */
  count: string | null;
  /** Only when nothing failed and the list is complete may the page say "nothing waiting". */
  showEmpty: boolean;
  /** True when old work may be missing (page limit reached). */
  showMore: boolean;
  partial: boolean;
};

/** What a "Chờ duyệt" surface may claim, given the rows and how complete they are. Pure. */
export function pendingView(p: { rows: readonly unknown[]; failed: readonly unknown[]; more: boolean }): PendingView {
  const failed = p.failed.length > 0;
  return {
    count: failed ? null : p.more ? `≥ ${p.rows.length}` : String(p.rows.length),
    showEmpty: !failed && !p.more,
    showMore: p.more,
    partial: failed || p.more,
  };
}

const GROUP_OF: Record<PendingKind, Exclude<PendingGroup, "all">> = { work: "work", studio_check: "check", studio_draft: "ai", curriculum_draft: "ai", skill: "skills", point: "skills", flag: "skills" };
const WAITING = ["draft", "ai_failed"] as const;
const isWaiting = (s: string) => (WAITING as readonly string[]).includes(s);

function byOldest(a: PendingRow, b: PendingRow): number {
  if (a.since === null || b.since === null) return a.since === b.since ? a.key.localeCompare(b.key) : a.since === null ? 1 : -1;
  return Date.parse(a.since) - Date.parse(b.since) || a.key.localeCompare(b.key);
}

export function buildPendingRows(i: PendingInput): PendingRow[] {
  const rows: PendingRow[] = [];
  const push = (r: Omit<PendingRow, "group">) => rows.push({ ...r, group: GROUP_OF[r.kind] });
  for (const w of i.work) {
    if (w.learnerId !== i.learnerId) continue;
    push({
      key: `work-${w.episodeId}`, kind: "work",
      label: w.revisionRound ? revisionReviewCopy.inboxLabel(w.revisionRound) : pendingCopy.kinds.work,
      title: `${w.titleVi} · ${activityLabels[w.activityType] ?? fallbackLabels.activity}`,
      since: w.submittedAt,
      need: w.revisionRound ? revisionReviewCopy.inboxProgress : reviewPage.progress(w.targetsDecided, w.targetsTotal),
      href: `/review/${w.episodeId}`, waitingTutor: !w.canDecide,
    });
  }
  for (const a of i.studio) {
    if (a.learnerId !== i.learnerId) continue;
    push({ key: `studio-${a.attemptId}`, kind: "studio_check", label: pendingCopy.kinds.studioCheck, title: a.title, since: a.submittedAt, need: pendingCopy.need.studioCheck(a.items.length), href: `/review/studio#studio-${a.attemptId}`, waitingTutor: false });
  }
  for (const s of i.skills) {
    if (s.learnerId !== i.learnerId) continue;
    const flag = s.kind === "FLAG";
    push({ key: `skill-${s.id}`, kind: flag ? "flag" : "skill", label: flag ? pendingCopy.kinds.flag : pendingCopy.kinds.skill, title: proposalTitle(s), since: s.createdAt, need: flag ? pendingCopy.need.flag : pendingCopy.need.skill, href: `/review/skills#skill-${s.id}`, waitingTutor: !s.canDecide });
  }
  for (const p of i.points ?? []) {
    if (p.learnerId !== i.learnerId) continue;
    const flag = p.kind === "FLAG";
    push({ key: `point-${p.id}`, kind: flag ? "flag" : "point", label: flag ? pendingCopy.kinds.flag : pendingCopy.kinds.point, title: pointTitle(p), since: p.createdAt, need: flag ? pendingCopy.need.flag : pendingCopy.need.point, href: `/review/skills#point-${p.id}`, waitingTutor: !p.canDecide });
  }
  for (const d of i.drafts) {
    if (d.superseded || !isWaiting(d.status)) continue;
    push({ key: `draft-${d.id}`, kind: "studio_draft", label: pendingCopy.kinds.studioDraft, title: d.title, since: d.updatedAt, need: d.status === "ai_failed" ? pendingCopy.need.aiFailed : pendingCopy.need.studioDraft, href: `/studio/drafts/${d.id}`, waitingTutor: false });
  }
  for (const c of i.curricula) {
    if (!c.open || !isWaiting(c.open.status)) continue;
    push({
      key: `curriculum-${c.open.versionId}`, kind: "curriculum_draft", label: pendingCopy.kinds.curriculumDraft,
      title: curriculumCopy.reviewTitle(c.title, c.open.version), since: null,
      need: c.open.status === "ai_failed" ? pendingCopy.need.aiFailed : pendingCopy.need.curriculumDraft,
      href: `/curricula/versions/${c.open.versionId}`,
      // Only the child's tutor approves a curriculum (D-W8); the parent may only discard a draft.
      waitingTutor: i.role !== "tutor" && c.open.status === "draft",
    });
  }
  return rows.sort(byOldest);
}

export function filterRows(rows: readonly PendingRow[], g: PendingGroup): PendingRow[] {
  return g === "all" ? [...rows] : rows.filter((r) => r.group === g);
}

export function countGroups(rows: readonly PendingRow[]): Record<PendingGroup, number> {
  const out: Record<PendingGroup, number> = { all: rows.length, work: 0, check: 0, ai: 0, skills: 0 };
  for (const r of rows) out[r.group] += 1;
  return out;
}

export function parseGroup(v: string | string[] | undefined): PendingGroup {
  const s = Array.isArray(v) ? v[0] : v;
  return (PENDING_GROUPS as readonly string[]).includes(s ?? "") ? (s as PendingGroup) : "all";
}
