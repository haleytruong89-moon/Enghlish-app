/** Small pure helpers that turn curriculum cards and day facts into the words the sessions page shows. */
import { sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth } from "./count";
import type { DayUnit, SessionDay } from "./types";

type CardLike = { id: string; title: string; current: { units: { code: string; title: string }[] } | null; progress: { current: { code: string; title: string } | null } | null };

/** Title of a Unit in an approved curriculum (null when unknown). */
export function unitTitleOf(cards: readonly CardLike[]): (curriculumId: string, code: string) => string | null {
  const m = new Map<string, string>();
  for (const c of cards) for (const u of c.current?.units ?? []) m.set(`${c.id}/${u.code}`, u.title);
  return (curriculumId, code) => m.get(`${curriculumId}/${code}`) ?? null;
}

/** "U13 Unreal time" (or just "U13"). */
export const unitText = (u: { code: string; title: string | null }): string => (u.title ? `${u.code} ${u.title}` : u.code);
export const unitsText = (units: readonly DayUnit[]): string => units.map(unitText).join(", ");

/** "Đang học đến": at most 2 curricula ("Destination: U13 Unreal time"), then "+k". Empty list = nothing started. */
export function currentUnitLines(cards: readonly CardLike[]): { lines: string[]; more: number } {
  const all = cards.filter((c) => c.progress?.current).map((c) => `${c.title}: ${unitText(c.progress!.current!)}`);
  return { lines: all.slice(0, 2), more: Math.max(0, all.length - 2) };
}

/** "Thứ Tư 12/11/2026" (the weekday of an ISO date). */
export function longDay(iso: string): string {
  const i = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${sessionStatsCopy.weekdaysLong[i]} ${dayMonth(iso)}/${iso.slice(0, 4)}`;
}

/** "1,5" (Vietnamese decimal comma) or the dash. */
export const perWeekText = (v: number | null): string => (v === null ? sessionStatsCopy.perWeekNone : String(v).replace(".", ","));

export const lastText = (last: string | null): string => (last ? dayMonth(last) : "");
export type { SessionDay };
