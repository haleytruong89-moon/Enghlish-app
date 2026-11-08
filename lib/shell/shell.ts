/** What the staff shell needs about the signed-in adult and the child in view (pure). */
import type { LearnerSummary } from "@/lib/home/visible";

export type StaffRole = "tutor" | "parent";
export type ShellData = { displayName: string; role: StaffRole; memberId: string; learners: LearnerSummary[]; current: LearnerSummary | null; revisionsReady: boolean };

export function firstParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

/** The hinted child when it is one of the caller's (RLS + ALLOW_REAL_LEARNERS filtered) children; else the first one. */
export function pickLearner(learners: readonly LearnerSummary[], hint: string | null): LearnerSummary | null {
  return (hint ? learners.find((l) => l.id === hint) : undefined) ?? learners[0] ?? null;
}

export function toShell(
  home: { kind: "tutor" | "parent" | "student"; displayName: string; memberId: string; learners: LearnerSummary[] },
  hint: string | null,
  revisionsReady: boolean,
): ShellData | null {
  if (home.kind === "student") return null;
  return { displayName: home.displayName, role: home.kind, memberId: home.memberId, learners: home.learners, current: pickLearner(home.learners, hint), revisionsReady };
}
