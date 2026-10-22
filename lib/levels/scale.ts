/** SM-2 level scales (spec 2026-10-21 P2-b, P4-c). Pure: used on the server, in the browser and by lib/skillmap/group.ts. */
import { CEFR_LEVELS, type CefrLevel, type DomainKey } from "@/lib/skillmap/types";
import type { DomainLevel, LevelProfile, Scale } from "./types";

export const TASK_LEVELS = ["1", "2", "3", "4"] as const;

export function levelsOf(scale: Scale): readonly string[] {
  return scale === "cefr" ? CEFR_LEVELS : TASK_LEVELS;
}

export function isLevelOf(scale: Scale, level: string): boolean {
  return levelsOf(scale).includes(level);
}

/** Position on the domain's own scale (CEFR 0..8, task level 0..3); null when unknown. */
export function stepIndex(scale: Scale, level: string | null | undefined): number | null {
  if (!level) return null;
  const i = levelsOf(scale).indexOf(level);
  return i < 0 ? null : i;
}

/** "Cấp" as Q1 and P4-c use it: A1 · A2/A2+ · B1/B1+ · B2/B2+ · C1 · C2 (0..5). Task levels are their own steps. */
const MAJOR: Record<CefrLevel, number> = { A1: 0, A2: 1, "A2+": 1, B1: 2, "B1+": 2, B2: 3, "B2+": 3, C1: 4, C2: 5 };
export function majorIndex(scale: Scale, level: string | null | undefined): number | null {
  const i = stepIndex(scale, level);
  if (i === null) return null;
  return scale === "cefr" ? MAJOR[level as CefrLevel] : i;
}

/** Bar length on its domain's scale: A1 = 1/9 … C2 = 1; bậc 1 = 1/4 … bậc 4 = 1. */
export function barFraction(scale: Scale, level: string): number {
  const i = stepIndex(scale, level);
  return i === null ? 0 : (i + 1) / levelsOf(scale).length;
}

/** Key of the group description that fits a level: "A1-A2" | "B1" | "B2" | "C1-C2" (CEFR) or "low" | "high" (task levels). */
export function bandOf(scale: Scale, level: string): string | null {
  const m = majorIndex(scale, level);
  if (m === null) return null;
  if (scale === "task_level") return m <= 1 ? "low" : "high";
  return m <= 1 ? "A1-A2" : m === 2 ? "B1" : m === 3 ? "B2" : "C1-C2";
}

type LeafLevels = { levelFrom: string | null; levelTo: string | null; taskFrom: number | null; taskTo: number | null };

/** P4-c (D1): does a leaf's level range touch the current level ± 1? No current level, or a leaf without a level → near. */
export function nearLevel(scale: Scale, current: string | null | undefined, leaf: LeafLevels): boolean {
  const c = majorIndex(scale, current);
  if (c === null) return true;
  const lo = scale === "cefr" ? majorIndex(scale, leaf.levelFrom) : leaf.taskFrom === null ? null : leaf.taskFrom - 1;
  const hi = scale === "cefr" ? majorIndex(scale, leaf.levelTo) : leaf.taskTo === null ? null : leaf.taskTo - 1;
  if (lo === null || hi === null) return true;
  return lo <= c + 1 && hi >= c - 1;
}

/** D4: strongest / weakest of the CEFR domains by current level. Thinking has its own scale and is left out. */
export function strongestWeakest(domains: DomainLevel[]): { strongest: DomainLevel[]; weakest: DomainLevel[]; even: boolean } {
  const rated = domains.flatMap((d) => {
    const i = d.scale === "cefr" ? stepIndex("cefr", d.current) : null;
    return i === null ? [] : [{ d, i }];
  });
  if (rated.length === 0) return { strongest: [], weakest: [], even: true };
  const max = Math.max(...rated.map((x) => x.i));
  const min = Math.min(...rated.map((x) => x.i));
  if (max === min) return { strongest: [], weakest: [], even: true };
  return { strongest: rated.filter((x) => x.i === max).map((x) => x.d), weakest: rated.filter((x) => x.i === min).map((x) => x.d), even: false };
}

/** Current level per domain, for the pickers (SkillMapView.current). */
export function currentLevels(profile: LevelProfile): Partial<Record<DomainKey, string>> {
  return Object.fromEntries(profile.domains.map((d) => [d.key, d.current]));
}
