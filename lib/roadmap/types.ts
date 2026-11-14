/**
 * Roadmap milestones (W4a · Lộ trình mốc) — constants and row types shared by the server, the browser and the tests. Pure.
 * Same limits as migration 0031. Rules: docs/DOMAIN.md §4 / §6 (bản 0.5), plan docs/superpowers/plans/2026-11-14-w4-student-desk.md §3.3–§3.4.
 */
export const MILESTONE_KINDS = ["progress_test", "mock_exam", "exam", "goal", "other"] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];
export const MILESTONE_ROLES = ["flag", "summit", "beyond"] as const;
export type MilestoneRole = (typeof MILESTONE_ROLES)[number];
export const MILESTONE_STATUSES = ["draft", "confirmed", "removed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const ROADMAP_LIMITS = { title: 80, reasonMin: 5, reasonMax: 300, history: 20 } as const;

/** One stored version of a milestone (a row of english.roadmap_milestones). `targetMonth` is "YYYY-MM-01" or null. */
export type MilestoneVersion = {
  id: string;
  milestoneId: string;
  version: number;
  kind: MilestoneKind;
  role: MilestoneRole;
  title: string;
  curriculumId: string | null;
  afterUnit: string | null;
  targetMonth: string | null;
  approx: boolean;
  status: MilestoneStatus;
  reason: string | null;
  proposalKey: string | null;
  createdAt: string;
};

/** What the tutor page shows for one milestone: the current version, what the child sees, and the history. */
export type MilestoneCard = {
  milestoneId: string;
  current: MilestoneVersion;
  /** The version the child sees (null = nothing). Equal to `current` when it is confirmed. */
  childSees: MilestoneVersion | null;
  /** True when `current` is a draft and the child still sees an older confirmed version. */
  childSeesOlder: boolean;
  history: MilestoneVersion[];
};

/** A proposal of the app (never stored until the tutor clicks). */
export type Proposal = {
  key: string;
  kind: MilestoneKind;
  role: MilestoneRole;
  title: string;
  curriculumId: string | null;
  afterUnit: string | null;
  targetMonth: string | null;
  approx: boolean;
  source: "progress_test" | "intake" | "track";
};

/** What the child may know about a milestone (eng_my_roadmap): never a draft, a removed one, a reason or a version number. */
export type ChildMilestone = {
  id: string;
  kind: MilestoneKind;
  role: MilestoneRole;
  title: string;
  curriculumId: string | null;
  afterUnit: string | null;
  targetMonth: string | null;
  approx: boolean;
};
