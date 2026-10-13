/** Pure helpers for the role home pages (unit-tested). */

export type LearnerSummary = {
  id: string;
  alias: string;
  trackId: "A" | "B";
  status: "active" | "draft";
  isTest: boolean;
  color: string | null;
};

/** ALLOW_REAL_LEARNERS=false → hide every non-test learner (Vercel previews, FX-02). */
export function visibleLearners(rows: LearnerSummary[], allowReal: boolean): LearnerSummary[] {
  return rows
    .filter((l) => allowReal || l.isTest)
    .sort((a, b) => a.trackId.localeCompare(b.trackId) || a.alias.localeCompare(b.alias, "vi"));
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const FALLBACK_LEARNER_COLOR = "#2B5D4F";

export function safeColor(color: string | null | undefined): string {
  return color && HEX.test(color) ? color : FALLBACK_LEARNER_COLOR;
}
