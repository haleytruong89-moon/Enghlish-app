/**
 * "Đã làm" / "Bỏ qua" on the "Việc nên làm" cards (PR-B, 26/11; migration 0043). The adult marks a card; it leaves the desk until NEWER
 * work feeds it again (a new submission after the click), so nothing stays hidden for good. The parent reads what was handled, by whom,
 * and how long after the work came in. Pure: the rows come from english.action_card_decisions (append-only; the latest row per card wins).
 */
import { isDecidable, type ActionCard, type DecidableKind } from "./actions";

export type CardDecision = {
  cardKey: string;
  kind: DecidableKind;
  label: string;
  decision: "done" | "skipped";
  reason: string | null;
  byRole: "tutor" | "parent";
  at: string;
  evidenceAt: string | null;
};

const DAY = 86_400_000;
const time = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/** The latest decision of each card (rows in any order; at equal times the later row in the list wins). */
export function latestByCard(rows: readonly CardDecision[]): Map<string, CardDecision> {
  const out = new Map<string, CardDecision>();
  for (const r of rows) {
    const cur = out.get(r.cardKey);
    if (!cur || time(r.at) >= time(cur.at)) out.set(r.cardKey, r);
  }
  return out;
}

/**
 * What the adult had seen when she clicked: the newest work the card showed (never later than the click). Work sent while her page was
 * open is newer than this, so it brings the card back instead of being hidden unseen.
 */
const seenUpTo = (d: CardDecision): number => {
  const at = time(d.at);
  const ev = time(d.evidenceAt);
  return Number.isNaN(ev) ? at : Math.min(ev, at);
};

/**
 * A card is handled when its latest decision covers the newest evidence behind it. Newer work brings the card back. The grade card is
 * never handled here (it goes away by itself once the work is graded).
 */
export function handledPredicate(rows: readonly CardDecision[]): (card: ActionCard) => boolean {
  const latest = latestByCard(rows);
  return (card) => {
    if (!isDecidable(card.kind)) return false;
    const d = latest.get(card.key);
    if (!d) return false;
    const ev = time(card.evidenceAt);
    return Number.isNaN(ev) || seenUpTo(d) >= ev;
  };
}

export type HandledItem = CardDecision & {
  /** Whole days from the newest work behind the card to the click (null when unknown). */
  afterDays: number | null;
  /** Newer work has come in since: the card is back on the desk. */
  reopened: boolean;
};

/**
 * What was handled, newest first, within `days` of today (the latest decision of each card only). `cards` = the cards as computed now
 * WITHOUT the handled filter, to tell which ones newer work has brought back.
 */
/** Start of the window "today and the N − 1 days before" (Vietnam days). */
const windowStart = (todayIso: string, days: number): number => time(`${todayIso}T00:00:00+07:00`) - (days - 1) * DAY;

export function handledList(rows: readonly CardDecision[], cards: readonly ActionCard[], todayIso: string, days = 30): HandledItem[] {
  const since = windowStart(todayIso, days);
  const now = new Map(cards.map((c) => [c.key, c]));
  return [...latestByCard(rows).values()]
    .filter((d) => time(d.at) >= since)
    .sort((a, b) => time(b.at) - time(a.at))
    .map((d) => {
      const ev = time(d.evidenceAt);
      const afterDays = Number.isNaN(ev) ? null : Math.max(0, Math.floor((time(d.at) - ev) / DAY));
      const card = now.get(d.cardKey);
      return { ...d, afterDays, reopened: card !== undefined && time(card.evidenceAt) > seenUpTo(d) };
    });
}

/** Handled in the last 7 days (the line on the desk). */
export const handledThisWeek = (items: readonly HandledItem[], todayIso: string): number => {
  const since = windowStart(todayIso, 7);
  return items.filter((i) => time(i.at) >= since).length;
};
