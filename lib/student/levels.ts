/**
 * W4e · the level NAMES the child sees per domain (plan §3.8, S-5, Q18). Pure.
 * Rules: only domains whose scale is CEFR (the Tư duy domain has the 1–4 task scale, which reads like a score: it is hidden by SCALE, never by name);
 * only a level the tutor CONFIRMED (a decision row exists) — an assumed level is never shown ("Thầy/cô chưa xác nhận"); never a number, never a comparison.
 */
import type { IsoDate } from "./week";
import { dayVn } from "./week";

export type LevelDomainRaw = {
  key: string;
  name: string;
  scale: "cefr" | "task_level";
  /** The level of the newest decision row of this domain; null = nothing confirmed yet. */
  level: string | null;
  /** When that decision was made (ISO timestamp). */
  on: string | null;
};

/** One tile per CEFR domain, in the order of the map. `level` is null while the tutor has not confirmed one (then the tile says so; it never shows an assumed level). */
export type LevelTile = { key: string; name: string; level: string | null; on: IsoDate | null };
export type LevelsView = { tiles: LevelTile[]; /** How many tiles carry a confirmed level. */ confirmed: number };

/** A CEFR name as the map writes it (A1 … C2, with an optional plus). Anything else (1–4, free text) is never shown to the child. */
export const CEFR_NAME = /^(A1|A2|B1|B2|C1|C2)\+?$/;

export function buildLevelsView(domains: readonly LevelDomainRaw[]): LevelsView {
  const tiles: LevelTile[] = [];
  for (const d of domains) {
    if (d.scale !== "cefr") continue;
    const ok = d.level !== null && d.on !== null && CEFR_NAME.test(d.level);
    tiles.push({ key: d.key, name: d.name, level: ok ? d.level : null, on: ok && d.on !== null ? dayVn(d.on) : null });
  }
  return { tiles, confirmed: tiles.filter((t) => t.level !== null).length };
}

/** The newest confirmation date among the tiles (null when none). */
export function latestLevelDate(view: LevelsView): IsoDate | null {
  return view.tiles.reduce<IsoDate | null>((best, t) => (t.on !== null && (best === null || t.on > best) ? t.on : best), null);
}
