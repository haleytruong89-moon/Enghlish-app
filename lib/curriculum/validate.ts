/**
 * Checks of a curriculum draft (spec §5 review screen: uncertain rows first, Duyệt disabled until resolved). Runs on every screen load
 * and again on "Duyệt" (the database checks the same things once more). Only rows that are not dropped count. Pure.
 */
import type { TocContext } from "./context";
import type { CurriculumPayload, UnitDraft } from "./schema";
import { UNIT_CODE_RE } from "./types";

export const CURRICULUM_ISSUES = ["no_units", "needs_review", "duplicate_code", "bad_code", "unknown_point", "no_points"] as const;
export type CurriculumIssueCode = (typeof CURRICULUM_ISSUES)[number];
/** `code` = the unit the issue is about, null for the whole draft. Only `no_points` does not block. */
export type CurriculumIssue = { code: string | null; issue: CurriculumIssueCode; blocking: boolean };

export const keptUnits = (p: CurriculumPayload): UnitDraft[] => p.units.filter((u) => !u.dropped);

export function validateCurriculum(p: CurriculumPayload, ctx: TocContext): CurriculumIssue[] {
  const out: CurriculumIssue[] = [];
  const kept = keptUnits(p);
  if (kept.length === 0) out.push({ code: null, issue: "no_units", blocking: true });
  const known = new Set(ctx.tags.map((t) => t.key));
  const count = new Map<string, number>();
  for (const u of kept) count.set(u.code, (count.get(u.code) ?? 0) + 1);
  for (const u of kept) {
    if (u.needs_review) out.push({ code: u.code, issue: "needs_review", blocking: true });
    if (!UNIT_CODE_RE.test(u.code)) out.push({ code: u.code, issue: "bad_code", blocking: true });
    if ((count.get(u.code) ?? 0) > 1) out.push({ code: u.code, issue: "duplicate_code", blocking: true });
    if (u.points.some((k) => !known.has(k))) out.push({ code: u.code, issue: "unknown_point", blocking: true });
    if (u.points.length === 0 && !u.skipped) out.push({ code: u.code, issue: "no_points", blocking: false });
  }
  return out;
}

/** "Còn n dòng cần xử lý": units with at least one blocking issue (+1 when the draft as a whole is blocked). */
export function rowsToResolve(issues: CurriculumIssue[]): number {
  const units = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  return units.size + (issues.some((i) => i.blocking && i.code === null) ? 1 : 0);
}

export const canApprove = (issues: CurriculumIssue[]): boolean => rowsToResolve(issues) === 0;

/** What eng_approve_curriculum_version receives: kept rows in the draft's order, only the stored columns. */
export function finalUnits(p: CurriculumPayload): { code: string; title: string; section: string | null; page: number | null; skipped: boolean; points: string[] }[] {
  return keptUnits(p).map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
}

/** Review screen order: rows that block first (in book order), then the rest (in book order). */
export function reviewOrder(p: CurriculumPayload, issues: CurriculumIssue[]): UnitDraft[] {
  const blocked = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  const kept = keptUnits(p);
  return [...kept.filter((u) => blocked.has(u.code)), ...kept.filter((u) => !blocked.has(u.code))];
}
