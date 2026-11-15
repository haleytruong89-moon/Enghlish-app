/**
 * What the app proposes as milestones (plan §3.4, Q11). Pure; nothing here is stored until the tutor clicks.
 * Sources: (i) the Progress Test / test rows of "Không phải Unit" of the main curriculum, (ii) the goals of the intake profile,
 * (iii) the language goal of the track (data in track_settings.roadmap_goal_label, never a branch on the track).
 * A proposal is hidden as soon as a milestone (any status) carries its key, so "Bỏ đề xuất" = a removed v1 and it never comes back.
 */
import { curriculumPayloadSchema } from "@/lib/curriculum/schema";
import { isProgressTest, relatedUnits } from "@/lib/curriculum/rows";
import { ROADMAP_LIMITS, type Proposal } from "./types";

/** Lower-case, no accents, [a-z0-9-] only, at most `max` characters; "untitled" when nothing is left. */
export function normalizeName(s: string, max = 60): string {
  const base = s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return base === "" ? "untitled" : base;
}

/** "06/2027" → {month: "2027-06-01", approx: false}; "~10/2027" → approx; anything else → no month. */
export function parseDue(due: string | null | undefined): { month: string | null; approx: boolean } {
  const m = /^\s*(~?)\s*(0?[1-9]|1[0-2])\s*\/\s*(\d{4})\s*$/.exec(due ?? "");
  if (!m) return { month: null, approx: false };
  return { month: `${m[3]}-${String(m[2]).padStart(2, "0")}-01`, approx: m[1] === "~" };
}

export type ProposalInput = {
  trackId: string;
  /** Main curriculum (with an approved version), or null. `payload` is the stored payload of the version in use. */
  curriculum: { id: string; payload: unknown; units: readonly { code: string; ord: number }[] } | null;
  intakeGoals: readonly { title: string; due?: string | null }[];
  /** track_settings.roadmap_goal_label of the child's track; null = not configured (no proposal from the track). */
  trackGoalLabel: string | null;
  /** Every proposal_key already used by a milestone of this child (any status). */
  usedKeys: ReadonlySet<string>;
  /** A summit already exists (the child sees one): goals are then proposed as "after the summit", never as a second summit. */
  summitExists?: boolean;
};

const clipTitle = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, ROADMAP_LIMITS.title).trim();

export function buildProposals(i: ProposalInput): Proposal[] {
  const out: Proposal[] = [];
  const seen = new Set<string>();
  const add = (p: Proposal) => {
    if (p.title === "" || seen.has(p.key) || i.usedKeys.has(p.key)) return;
    seen.add(p.key);
    out.push(p);
  };

  // (i) Progress Tests → a flag after the last Unit they revise.
  if (i.curriculum) {
    const parsed = curriculumPayloadSchema.safeParse(i.curriculum.payload);
    if (parsed.success) {
      const ordOf = new Map(i.curriculum.units.map((u) => [u.code, u.ord]));
      parsed.data.ignored.forEach((row, k) => {
        if (!isProgressTest(row)) return;
        const related = relatedUnits(parsed.data, k).filter((c) => ordOf.has(c));
        const last = related.sort((a, b) => (ordOf.get(b) as number) - (ordOf.get(a) as number))[0] ?? null;
        const name = normalizeName(row.label, 100);
        add({
          key: `pt:${(i.curriculum as { id: string }).id}:${name}`, kind: "progress_test", role: "flag", title: clipTitle(row.label),
          curriculumId: last ? i.curriculum!.id : null, afterUnit: last, targetMonth: null, approx: false, source: "progress_test",
        });
      });
    }
  }

  // (ii) intake goals: the first is the summit, the others come after it.
  const goals = i.intakeGoals.filter((g) => clipTitle(g.title) !== "");
  goals.forEach((g, n) => {
    const due = parseDue(g.due);
    add({
      key: `goal:${normalizeName(g.title, 120)}`, kind: "goal", role: n === 0 && !i.summitExists ? "summit" : "beyond", title: clipTitle(g.title),
      curriculumId: null, afterUnit: null, targetMonth: due.month, approx: due.approx, source: "intake",
    });
  });

  // (iii) the goal of the track: the summit when the intake has no goal, else after the summit.
  if (i.trackGoalLabel && clipTitle(i.trackGoalLabel) !== "") {
    add({
      key: `track:${normalizeName(i.trackId, 100)}`, kind: "goal", role: goals.length === 0 && !i.summitExists ? "summit" : "beyond", title: clipTitle(i.trackGoalLabel),
      curriculumId: null, afterUnit: null, targetMonth: null, approx: false, source: "track",
    });
  }
  return out;
}
