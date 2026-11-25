/**
 * "Việc nên làm" (26/11): a few cards that turn the results into something to DO — grade what waits, go over a weak part with the
 * child, give more practice on a weak knowledge item, go back over a weak Unit, praise what went well. Fixed rules (no AI): each card
 * says why, with its numbers, and has one button to the page where the adult acts. Nothing is decided here. Pure.
 */
import { pct, ratio, type TagAgg, type UnitScore, type WorkScore } from "./score";

/** Thresholds approved by the parent (25/11). */
export const RESULT_RULES = {
  /** A test or a part below this share: go over it with the child. */
  fixTogetherBelow: 0.5,
  /** A knowledge item below this share across ≥ 2 tests: give more practice. */
  practiseBelow: 0.6,
  /** A Unit below this share: go back over it before moving on. */
  unitReviewBelow: 0.6,
  /** A test or a part at or above this share: praise it. */
  praiseFrom: 0.8,
  /** Fewer decided questions than this is too little to judge. */
  minItems: 4,
  /** Work the adult has not finished: amber from this many days, red from the next threshold. */
  waitAmberDays: 2,
  waitRedDays: 5,
  /** Only recent work makes a "go over it / praise" card (older work belongs to the Results page). */
  recentDays: 21,
  /** The desk shows at most this many cards, with at most this many of each kind, so every kind of action can be seen. */
  maxCards: 6,
  deskCaps: { grade: 1, fix_together: 2, unit_review: 1, practise: 1, praise: 1 } as Readonly<Record<"grade" | "fix_together" | "unit_review" | "practise" | "praise", number>>,
} as const;

export type ActionKind = "grade" | "fix_together" | "practise" | "unit_review" | "praise";
export type ActionTone = "red" | "amber" | "info" | "good";
export type ActionCard = {
  key: string;
  kind: ActionKind;
  tone: ActionTone;
  /** Values the copy turns into words (lib/copy/vi.ts resultsCopy.cards). */
  facts: {
    title?: string;
    part?: string;
    unit?: string;
    tag?: string;
    correct?: number;
    decided?: number;
    percent?: number;
    works?: number;
    pendingItems?: number;
    feedbackMissing?: number;
    oldestDays?: number;
  };
  href: string;
};

export type ActionInput = {
  learnerId: string;
  works: readonly WorkScore[];
  units: readonly UnitScore[];
  tags: readonly TagAgg[];
};

const TONE_ORDER: Record<ActionTone, number> = { red: 0, amber: 1, info: 2, good: 3 };
const KIND_ORDER: Record<ActionKind, number> = { grade: 0, fix_together: 1, unit_review: 2, practise: 3, praise: 4 };

export function waitTone(days: number): ActionTone {
  return days >= RESULT_RULES.waitRedDays ? "red" : days >= RESULT_RULES.waitAmberDays ? "amber" : "info";
}

export type ActionOptions = {
  limit?: number;
  /** Most cards of one kind (the desk); none = no cap (the Results page). */
  caps?: Partial<Record<ActionKind, number>>;
  /** Most one "go over it" card per test (the desk shows the weakest part of each test). */
  onePerWork?: boolean;
};
export const DESK_OPTIONS: ActionOptions = { limit: RESULT_RULES.maxCards, caps: RESULT_RULES.deskCaps, onePerWork: true };
export const PAGE_OPTIONS: ActionOptions = { limit: 30 };

export function buildActions(i: ActionInput, opts: ActionOptions = DESK_OPTIONS): ActionCard[] {
  const limit = opts.limit ?? RESULT_RULES.maxCards;
  const R = RESULT_RULES;
  const cards: ActionCard[] = [];
  const base = `/learners/${i.learnerId}`;

  // 1. What waits for the adult: questions to decide, feedback to give. One card; the button opens the oldest piece.
  const waiting = i.works.filter((w) => w.needsAdult).sort((a, b) => b.waitingDays - a.waitingDays || a.submittedAt.localeCompare(b.submittedAt));
  if (waiting.length > 0) {
    const oldest = waiting[0]!;
    const pendingItems = waiting.reduce((n, w) => n + w.tally.pending, 0);
    const feedbackMissing = waiting.filter((w) => w.feedbackReady && !w.feedbackGiven).length;
    const href = oldest.tally.pending > 0 && oldest.lastAttemptId ? `/review/studio?learner=${i.learnerId}#studio-${oldest.lastAttemptId}` : oldest.episodeId ? `/review/${oldest.episodeId}` : `${base}/assigned`;
    cards.push({ key: "grade", kind: "grade", tone: waitTone(oldest.waitingDays), facts: { works: waiting.length, pendingItems, feedbackMissing, oldestDays: oldest.waitingDays, title: oldest.title }, href });
  }

  const recent = i.works.filter((w) => w.waitingDays <= R.recentDays);
  const sessionHref = `${base}/notes/new#goi-y-buoi-hoc`;

  // 2. Go over a weak part (or a weak test without parts) with the child. The weakest first.
  const weakParts: { w: WorkScore; name: string | null; t: WorkScore["tally"] }[] = [];
  for (const w of recent) {
    const parts = w.parts.filter((p) => p.tally.decided >= R.minItems);
    if (parts.length > 1) {
      for (const p of parts) if ((ratio(p.tally) ?? 1) < R.fixTogetherBelow) weakParts.push({ w, name: p.name, t: p.tally });
    } else if (w.tally.decided >= R.minItems && (ratio(w.tally) ?? 1) < R.fixTogetherBelow) {
      weakParts.push({ w, name: null, t: w.tally });
    }
  }
  // Weakest first; at equal share, the part with more questions (more evidence).
  weakParts.sort((a, b) => (ratio(a.t) ?? 1) - (ratio(b.t) ?? 1) || b.t.decided - a.t.decided);
  const seenWork = new Set<string>();
  for (const x of weakParts) {
    if (opts.onePerWork) {
      if (seenWork.has(x.w.instanceId)) continue;
      seenWork.add(x.w.instanceId);
    }
    cards.push({
      key: `fix-${x.w.instanceId}-${x.name ?? "all"}`, kind: "fix_together", tone: "red",
      facts: { title: x.w.title, part: x.name ?? undefined, correct: x.t.correct, decided: x.t.decided, percent: pct(x.t) ?? 0 },
      href: sessionHref,
    });
  }

  // 3. Go back over a weak Unit before moving on (a book Unit only: a Review / Progress Test is itself the going back). Weakest first.
  for (const u of [...i.units].sort((a, b) => (ratio(a.tally) ?? 1) - (ratio(b.tally) ?? 1))) {
    if (!/^U\d+$/.test(u.key) || u.tally.decided < R.minItems || (ratio(u.tally) ?? 1) >= R.unitReviewBelow) continue;
    cards.push({ key: `unit-${u.key}`, kind: "unit_review", tone: "amber", facts: { unit: u.key, correct: u.tally.correct, decided: u.tally.decided, percent: pct(u.tally) ?? 0, works: u.works }, href: sessionHref });
  }

  // 4. More practice on a knowledge item weak across ≥ 2 tests.
  for (const t of i.tags) {
    if (t.works < 2 || t.tally.decided < R.minItems || (ratio(t.tally) ?? 1) >= R.practiseBelow) continue;
    cards.push({ key: `tag-${t.key}`, kind: "practise", tone: "amber", facts: { tag: t.key, correct: t.tally.correct, decided: t.tally.decided, percent: pct(t.tally) ?? 0, works: t.works }, href: `${base}/assign` });
  }

  // 5. Praise: the newest strong part or test (one card), so feedback starts with something true and specific.
  const strong = recent
    .flatMap((w) => {
      const parts = w.parts.filter((p) => p.tally.decided >= R.minItems && (ratio(p.tally) ?? 0) >= R.praiseFrom);
      if (parts.length > 0 && w.parts.length > 1) return parts.map((p) => ({ w, name: p.name as string | null, t: p.tally }));
      return w.tally.decided >= R.minItems && (ratio(w.tally) ?? 0) >= R.praiseFrom ? [{ w, name: null, t: w.tally }] : [];
    })
    .sort((a, b) => b.w.submittedAt.localeCompare(a.w.submittedAt) || (ratio(b.t) ?? 0) - (ratio(a.t) ?? 0));
  const best = strong[0];
  if (best) {
    cards.push({
      key: `praise-${best.w.instanceId}`, kind: "praise", tone: "good",
      facts: { title: best.w.title, part: best.name ?? undefined, correct: best.t.correct, decided: best.t.decided, percent: pct(best.t) ?? 0 },
      href: best.w.episodeId ? `/review/${best.w.episodeId}` : `${base}/assigned`,
    });
  }

  // The "grade" card always leads (the parent asked for the reminder to stand out); then by urgency; praise keeps one slot. The sort is
  // stable, so within a kind the order above (weakest first) stays.
  const rank = (c: ActionCard) => (c.kind === "grade" ? -1 : TONE_ORDER[c.tone]);
  const taken: Partial<Record<ActionKind, number>> = {};
  const capped = cards.filter((c) => {
    const cap = opts.caps?.[c.kind];
    taken[c.kind] = (taken[c.kind] ?? 0) + 1;
    return cap === undefined || (taken[c.kind] as number) <= cap;
  });
  const sorted = capped.filter((c) => c.kind !== "praise").sort((a, b) => rank(a) - rank(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const praise = capped.filter((c) => c.kind === "praise");
  return praise.length > 0 && limit > 1 ? [...sorted.slice(0, limit - 1), ...praise.slice(0, 1)] : sorted.slice(0, limit);
}

/** Cards the tutor can act on IN a lesson (the session page shows them above the form). */
export const sessionCards = (cards: readonly ActionCard[]): ActionCard[] => cards.filter((c) => c.kind === "fix_together" || c.kind === "unit_review" || c.kind === "practise");
