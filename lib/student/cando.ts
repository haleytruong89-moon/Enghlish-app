/**
 * W4e · "Những điều mình đã làm được" (plan §3.8, Q17). Pure. The database returns only what the tutor CONFIRMED at level 3–4 whose newest
 * decision row is still that confirmation (a skill or knowledge item that fell back is not returned: it is hidden quietly, no "lost" message).
 * Here: the child-friendly NAME (Track A skills use the names of UX §3.4 "tên cho học sinh"; the rest keep their own Vietnamese title), the
 * date, "Mới" (confirmed within 7 days of the database's clock) and newest first. No number of any kind other than the count of the cards.
 */
import { dayVn, addDays, type IsoDate } from "./week";

export type CandoRaw = {
  /** A skill's code (target id) for Track A name lookup; null for a knowledge item. */
  code: string | null;
  name: string;
  /** When the tutor confirmed (ISO timestamp). */
  at: string;
};

export type CandoItem = { id: string; text: string; at: string; date: IsoDate; isNew: boolean; /** "skill" (a skill, wording "Mình đã tự làm được") or "point" (a knowledge item, "Mình đã nắm chắc"). */ kind: "skill" | "point" };

export const NEW_WITHIN_DAYS = 7;
export const CANDO_SHOWN_MAX = 60;

export type StudentNames = Readonly<Record<string, { student: string }>>;

/** `now` is the database's clock (never the device's). */
export function buildCando(raw: readonly CandoRaw[], now: string, names: StudentNames = {}): CandoItem[] {
  const today = dayVn(now);
  const since = addDays(today, -NEW_WITHIN_DAYS);
  const seen = new Set<string>();
  const items: CandoItem[] = [];
  for (const r of [...raw].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))) {
    const text = ((r.code ? names[r.code]?.student : undefined) ?? r.name).trim();
    if (text === "" || seen.has(text.toLowerCase())) continue;   // the same words twice (a skill and a knowledge item) are one card
    seen.add(text.toLowerCase());
    const date = dayVn(r.at);
    items.push({ id: `c${items.length}`, text, at: r.at, date, isNew: date >= since && date <= today, kind: r.code ? "skill" : "point" });
  }
  return items.slice(0, CANDO_SHOWN_MAX);
}

/** Times (oldest first) of the cards, for the achievement "n điều tự làm được". */
export const candoTimes = (items: readonly CandoItem[]): string[] => items.map((i) => i.at).sort();

/** The "ever" times from the ledgers as the achievement wants them: rung n → time. */
export const candoEverMap = (ever: readonly { n: number; at: string }[]): Record<number, string> => Object.fromEntries(ever.map((e) => [e.n, e.at]));
