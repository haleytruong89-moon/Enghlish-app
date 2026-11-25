/**
 * "Chờ duyệt" of one child as one compact list (spec §3, §5 rule 4): every source that already waits for an adult, oldest first.
 * Pure. A row only LINKS to the page where the decision is made (DOMAIN R1, spec §3: no one-click approval) — it decides nothing.
 */
import { deskHref, roadmapHref } from "@/lib/shell/paths";
import { activityLabels, curriculumCopy, fallbackLabels, pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { ImportPendingItem } from "@/lib/import/pending";
import type { PointInboxItem } from "@/lib/points/types";
import { pointTitle } from "@/lib/points/view";
import type { InboxItem } from "@/lib/review/types";
import type { SkillInboxItem } from "@/lib/skills/types";
import { proposalTitle } from "@/lib/skills/view";
import { tabOfStudio } from "@/lib/assigned/board";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import type { DraftListItem, PendingAttempt, RetryAttempt } from "@/lib/studio/types";

/**
 * "drafts" (audit 25/11, Q1): Studio drafts waiting to be checked before they are given — e.g. a whole book imported at once. They are
 * the tutor's stock, not work the child is waiting on, so they are NOT in "Tất cả" and NOT in the number beside "Chờ duyệt".
 */
export const PENDING_GROUPS = ["all", "work", "check", "ai", "skills", "roadmap", "goals", "drafts"] as const;
export type PendingGroup = (typeof PENDING_GROUPS)[number];
/** Groups left out of "Tất cả" and of every count of "Chờ duyệt". */
export const UNCOUNTED_GROUPS: readonly PendingGroup[] = ["drafts"];
export type PendingKind = "work" | "studio_check" | "retry" | "feedback" | "studio_draft" | "curriculum_draft" | "skill" | "point" | "flag" | "import" | "milestone" | "goal";
export type PendingRow = {
  key: string; kind: PendingKind; group: Exclude<PendingGroup, "all">; label: string; title: string; since: string | null; need: string; href: string; waitingTutor: boolean;
  /** The submission this row is about (work, Studio check, retry, feedback); rows of one submission are merged into one (Q2). */
  attemptId?: string;
};
/** A Studio submission whose latest attempt has no feedback yet (same rule as the "Cần thầy/cô xử lý" tab of Bài đã giao). */
export type FeedbackWaiting = { attemptId: string; title: string; since: string; href: string };
export type PendingInput = {
  learnerId: string;
  role: "tutor" | "parent";
  work: readonly InboxItem[];
  studio: readonly PendingAttempt[];
  /** Retries (W4c2) no adult has acted on since; the row links to the section on "Cần thầy/cô xem". */
  retries?: readonly RetryAttempt[];
  skills: readonly SkillInboxItem[];
  /** Knowledge-point proposals and ⚑ (W3); they only LINK to the "Kỹ năng" tab, where the child's tutor confirms one by one. */
  points?: readonly PointInboxItem[];
  /** Drafts of THIS child (loadDraftList is per child). */
  drafts: readonly DraftListItem[];
  /** Curricula of THIS child (loadCurriculumCards is per child). */
  curricula: readonly CurriculumCard[];
  /** Unfinished imports (W3): reading / draft / ai_failed. They only LINK to /imports/<id>; the child's tutor confirms there (R8). */
  imports?: readonly ImportPendingItem[];
  /** Roadmap (W4a): milestones whose current version is a draft (proposals of the app are NOT counted: they show on the Lộ trình page and as a soft line on the desk). 0 / undefined = none. */
  roadmapDrafts?: number;
  /** Weekly goal (W4d): the proposal the child made that nobody answered. It only LINKS to the goal box of the desk, where the child's tutor agrees. */
  goal?: { id: string; pieces: number; since: string } | null;
  /** Studio submissions of THIS child without feedback (Q2, from `feedbackWaiting`). */
  feedback?: readonly FeedbackWaiting[];
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

/** The rows that count as waiting work (every group but the uncounted ones). */
export const countedRows = <R extends Pick<PendingRow, "group">>(rows: readonly R[]): R[] => rows.filter((r) => !UNCOUNTED_GROUPS.includes(r.group));

/** What a "Chờ duyệt" surface may claim, given the rows and how complete they are. Pure. Uncounted groups never count. */
export function pendingView(p: { rows: readonly Pick<PendingRow, "group">[]; failed: readonly unknown[]; more: boolean }): PendingView {
  const failed = p.failed.length > 0;
  const n = countedRows(p.rows).length;
  return {
    count: failed ? null : p.more ? `≥ ${n}` : String(n),
    showEmpty: !failed && !p.more,
    showMore: p.more,
    partial: failed || p.more,
  };
}

const GROUP_OF: Record<PendingKind, Exclude<PendingGroup, "all">> = { work: "work", studio_check: "check", retry: "check", feedback: "work", studio_draft: "drafts", curriculum_draft: "ai", skill: "skills", point: "skills", flag: "skills", import: "check", milestone: "roadmap", goal: "goals" };
const WAITING = ["draft", "ai_failed"] as const;
const isWaiting = (s: string) => (WAITING as readonly string[]).includes(s);

function byOldest(a: PendingRow, b: PendingRow): number {
  if (a.since === null || b.since === null) return a.since === b.since ? a.key.localeCompare(b.key) : a.since === null ? 1 : -1;
  return Date.parse(a.since) - Date.parse(b.since) || a.key.localeCompare(b.key);
}

/** "Con thử lại 2 câu" / "Con xem đáp án 1 câu" / both with " · ". */
function retryNeed(items: readonly { kind: "retry" | "revealed" }[]): string {
  const retried = items.filter((x) => x.kind === "retry").length;
  const shown = items.length - retried;
  return [retried > 0 ? pendingCopy.need.retry(retried) : null, shown > 0 ? pendingCopy.need.reveal(shown) : null].filter(Boolean).join(" · ");
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
      href: `/review/${w.episodeId}`, waitingTutor: !w.canDecide, attemptId: w.attemptId,
    });
  }
  for (const a of i.studio) {
    if (a.learnerId !== i.learnerId) continue;
    push({ key: `studio-${a.attemptId}`, kind: "studio_check", label: pendingCopy.kinds.studioCheck, title: a.title, since: a.submittedAt, need: pendingCopy.need.studioCheck(a.items.length), href: `/review/studio#studio-${a.attemptId}`, waitingTutor: false, attemptId: a.attemptId });
  }
  for (const a of i.retries ?? []) {
    if (a.learnerId !== i.learnerId) continue;
    push({ key: `retry-${a.attemptId}`, kind: "retry", label: pendingCopy.kinds.retry, title: a.title, since: a.since, need: retryNeed(a.retries), href: `/review/studio?learner=${a.learnerId}#retry-${a.attemptId}`, waitingTutor: false, attemptId: a.attemptId });
  }
  for (const f of i.feedback ?? []) {
    push({ key: `feedback-${f.attemptId}`, kind: "feedback", label: pendingCopy.kinds.feedback, title: f.title, since: f.since, need: pendingCopy.need.feedback, href: f.href, waitingTutor: false, attemptId: f.attemptId });
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
  for (const m of i.imports ?? []) {
    if (m.learnerId !== i.learnerId) continue;
    push({
      key: `import-${m.id}`, kind: "import", label: pendingCopy.kinds.import, title: m.title, since: m.updatedAt,
      need: m.status === "reading" ? pendingCopy.need.importReading : m.status === "ai_failed" ? pendingCopy.need.importFailed : pendingCopy.need.import,
      href: `/imports/${m.id}`, waitingTutor: i.role !== "tutor" && m.status === "draft",
    });
  }
  if ((i.roadmapDrafts ?? 0) > 0) {
    push({
      key: "roadmap-waiting", kind: "milestone", label: pendingCopy.kinds.milestone, title: pendingCopy.need.milestone(i.roadmapDrafts as number), since: null,
      need: pendingCopy.need.milestoneNeed, href: roadmapHref(i.learnerId), waitingTutor: i.role !== "tutor",
    });
  }
  if (i.goal) {
    push({
      key: `goal-${i.goal.id}`, kind: "goal", label: pendingCopy.kinds.goal, title: pendingCopy.need.goal(i.goal.pieces), since: i.goal.since,
      need: pendingCopy.need.goalNeed, href: `${deskHref(i.learnerId)}#goal-box`, waitingTutor: i.role !== "tutor",
    });
  }
  return mergeBySubmission(rows).sort(byOldest);
}

/** The order of the parts of one submission: what the tutor does first comes first, and "Mở" opens it. */
const PART_ORDER: readonly PendingKind[] = ["studio_check", "work", "retry", "feedback"];
const lowerFirst = (s: string): string => s.charAt(0).toLocaleLowerCase("vi") + s.slice(1);

/**
 * Q2 (audit 25/11): one submission waits in several places (questions to check, skills to score, the child's retries, feedback). Its
 * rows become ONE row "Bài nộp" whose "Cần làm" lists every part ("8 câu cần xem · đã chấm 0/1 kỹ năng · chưa góp ý") and whose link
 * opens the first part. Rows of a single part are left as they are. Nothing is decided here.
 */
export function mergeBySubmission(rows: readonly PendingRow[]): PendingRow[] {
  const byAttempt = new Map<string, PendingRow[]>();
  for (const r of rows) if (r.attemptId && PART_ORDER.includes(r.kind)) byAttempt.set(r.attemptId, [...(byAttempt.get(r.attemptId) ?? []), r]);
  const out: PendingRow[] = [];
  const done = new Set<string>();
  for (const r of rows) {
    const parts = r.attemptId ? byAttempt.get(r.attemptId) : undefined;
    // Two rows of the same kind for one attempt (e.g. a revision episode) are not parts of one submission: leave them alone.
    if (!parts || parts.length < 2 || new Set(parts.map((p) => p.kind)).size !== parts.length) {
      out.push(r);
      continue;
    }
    if (done.has(r.attemptId as string)) continue;
    done.add(r.attemptId as string);
    const sorted = [...parts].sort((a, b) => PART_ORDER.indexOf(a.kind) - PART_ORDER.indexOf(b.kind));
    const first = sorted[0] as PendingRow;
    const dated = sorted.map((p) => p.since).filter((d): d is string => d !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
    // The Studio title is the test's own name; the work row adds the activity ("· Đọc hoặc nghe…"), so it is used only when alone.
    const title = sorted.find((p) => p.kind !== "work")?.title ?? first.title;
    out.push({
      key: `attempt-${r.attemptId}`, kind: first.kind, group: "work", label: pendingCopy.kinds.work, title,
      since: dated[0] ?? null,
      need: sorted.map((p, n) => (n === 0 ? p.need : lowerFirst(p.need))).join(" · "),
      href: first.href,
      waitingTutor: sorted.every((p) => p.waitingTutor),
      attemptId: r.attemptId,
    });
  }
  return out;
}

/** Studio submissions without feedback on their latest attempt, as "Chờ duyệt" lists them (Q2). Same rule as Bài đã giao. Pure. */
export function feedbackWaiting(rows: readonly StudioAssignedRow[]): FeedbackWaiting[] {
  return rows
    .filter((r) => tabOfStudio(r) === "need" && r.feedbackReady && !r.feedbackGiven && r.lastAttemptId && r.lastSubmittedAt && r.episodeId)
    .map((r) => ({ attemptId: r.lastAttemptId as string, title: r.title, since: r.lastSubmittedAt as string, href: `/review/${r.episodeId}` }));
}

export function filterRows(rows: readonly PendingRow[], g: PendingGroup): PendingRow[] {
  return g === "all" ? countedRows(rows) : rows.filter((r) => r.group === g);
}

export function countGroups(rows: readonly PendingRow[]): Record<PendingGroup, number> {
  const out: Record<PendingGroup, number> = { all: countedRows(rows).length, work: 0, check: 0, ai: 0, skills: 0, roadmap: 0, goals: 0, drafts: 0 };
  for (const r of rows) out[r.group] += 1;
  return out;
}

export function parseGroup(v: string | string[] | undefined): PendingGroup {
  const s = Array.isArray(v) ? v[0] : v;
  return (PENDING_GROUPS as readonly string[]).includes(s ?? "") ? (s as PendingGroup) : "all";
}
