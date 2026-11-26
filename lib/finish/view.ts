/**
 * L1 · "Xong một bài" (26/11): one Studio submission as the adult checks it — every question with the child's answer, the key, how it
 * stands (the app's check, the adult's Đúng/Sai, waiting, or only on paper) and the child's retry; tallies with the verdicts the adult
 * has just picked; app-made feedback suggestions (no AI). Pure: shared by the page (server) and the screen (client).
 *
 * Measurement rules kept (DOMAIN): the app's check or the adult's decision; a question only the paper holds is shown, never counted;
 * a blank is not right. The child sees none of the numbers (D35).
 */
import { finishCopy } from "@/lib/copy/vi";
import type { ReviewEpisodeView } from "@/lib/review/types";
import { partLabel, ratio, type ItemMeta, type Tally } from "@/lib/results/score";
import type { RetryItem } from "@/lib/studio/types";
import { questionNumber } from "@/lib/studio/view";

export type Verdict = "correct" | "incorrect";
export type FinishState = "correct" | "incorrect" | "blank" | "waiting" | "paper";
export type FinishItem = {
  id: string;
  n: number;
  stem: string;
  given: string;
  key: string | null;
  state: FinishState;
  /** Decided by an adult (Đúng/Sai) rather than by the app. */
  byAdult: boolean;
  /** The app left this question to a person and nobody has decided it yet: the screen shows Đúng / Sai. */
  needsAdult: boolean;
  retry: { text: string | null; revealed: boolean } | null;
};
export type FinishPart = { key: string; label: string; items: FinishItem[] };

const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function buildFinishParts(i: {
  items: readonly { id: string; stem: string }[];
  answers: Readonly<Record<string, unknown>>;
  checks: ReviewEpisodeView["autoChecks"];
  keys: ReviewEpisodeView["keys"];
  decisions: Readonly<Record<string, Verdict>>;
  meta: ReadonlyMap<string, ItemMeta>;
  partNames: ReadonlyMap<string, string>;
  retries: readonly RetryItem[];
}): FinishPart[] {
  const keyOf = new Map(i.keys.map((k) => [k.itemId, k.answer]));
  const retryOf = new Map(i.retries.map((r) => [r.itemId, r]));
  const parts = new Map<string, FinishItem[]>();
  i.items.forEach((it, index) => {
    const m = i.meta.get(it.id);
    const res = i.checks?.items[it.id]?.result;
    const decision = i.decisions[it.id];
    let state: FinishState;
    let byAdult = false;
    let needsAdult = false;
    if (m?.outOfApp) state = "paper";
    else if (res === "correct" || res === "incorrect" || res === "blank") state = res;
    else if (decision) {
      state = decision;
      byAdult = true;
    } else {
      state = "waiting";
      needsAdult = res === "needs_person";
    }
    const r = retryOf.get(it.id);
    const item: FinishItem = {
      id: it.id, n: m?.n ?? questionNumber(it.id, index), stem: it.stem, given: text(i.answers[it.id]), key: keyOf.get(it.id) ?? null,
      state, byAdult, needsAdult, retry: r ? { text: r.kind === "retry" ? r.retry : null, revealed: r.kind === "revealed" } : null,
    };
    const pk = m?.part ?? "";
    parts.set(pk, [...(parts.get(pk) ?? []), item]);
  });
  return [...parts.entries()].map(([key, items]) => ({
    key,
    label: key ? partLabel(key, i.partNames.get(key) ?? "") : finishCopy.noPart,
    items: [...items].sort((a, b) => a.n - b.n),
  }));
}

/** The state with the adult's not-yet-saved verdict applied (only to a question waiting for a person). */
export const stateWith = (item: FinishItem, local: Readonly<Record<string, Verdict>> = {}): FinishState =>
  item.needsAdult && local[item.id] ? (local[item.id] as Verdict) : item.state;

const tallyItems = (items: readonly FinishItem[], local: Readonly<Record<string, Verdict>>): Tally =>
  items.reduce<Tally>((t, it) => {
    const s = stateWith(it, local);
    if (s === "paper") return t;
    if (s === "waiting") return { ...t, pending: t.pending + 1 };
    return { ...t, decided: t.decided + 1, correct: t.correct + (s === "correct" ? 1 : 0) };
  }, { correct: 0, decided: 0, pending: 0 });

export const partTally = (part: FinishPart, local: Readonly<Record<string, Verdict>> = {}): Tally => tallyItems(part.items, local);
export const tallyParts = (parts: readonly FinishPart[], local: Readonly<Record<string, Verdict>> = {}): Tally => tallyItems(parts.flatMap((p) => p.items), local);

/** Worth the adult's eye: waiting, wrong, blank, or retried by the child. */
export const isIssue = (item: FinishItem, local: Readonly<Record<string, Verdict>> = {}): boolean => {
  const s = stateWith(item, local);
  return s === "waiting" || s === "incorrect" || s === "blank" || item.retry !== null;
};

const MAX_LISTED = 6;
const listNs = (ns: readonly number[]): string =>
  ns.length <= MAX_LISTED ? ns.join(", ") : `${ns.slice(0, MAX_LISTED).join(", ")}${finishCopy.suggest.more(ns.length - MAX_LISTED)}`;

/**
 * App-made suggestions (no AI) from the questions as they stand: praise for parts all right (≥ 3 decided, at most 2), fixes for parts
 * with wrong / blank answers (weakest first, at most 3). Words only: no fraction, no "%", no "điểm" (the child reads them).
 */
export function feedbackSuggestions(parts: readonly FinishPart[], local: Readonly<Record<string, Verdict>> = {}): { praise: string[]; fixes: string[] } {
  const single = parts.length === 1 && parts[0]!.key === "";
  const scored = parts.map((p) => ({ p, t: partTally(p, local), wrong: p.items.filter((it) => ["incorrect", "blank"].includes(stateWith(it, local))).map((it) => it.n) }));
  const fixes = scored
    .filter((x) => x.wrong.length > 0)
    .sort((a, b) => (ratio(a.t) ?? 1) - (ratio(b.t) ?? 1) || a.p.key.localeCompare(b.p.key))
    .slice(0, 3)
    .map((x) => (single ? finishCopy.suggest.fixAll(listNs(x.wrong)) : finishCopy.suggest.fix(`Phần ${x.p.label}`, listNs(x.wrong))));
  const strong = scored.filter((x) => x.t.decided >= 3 && x.t.pending === 0 && x.t.correct === x.t.decided);
  const praise =
    fixes.length === 0 && scored.every((x) => x.t.pending === 0) && scored.some((x) => x.t.decided > 0)
      ? [finishCopy.suggest.praiseAll]
      : strong.slice(0, 2).map((x) => (single ? finishCopy.suggest.praiseAll : finishCopy.suggest.praise(`Phần ${x.p.label}`)));
  return { praise, fixes };
}

/** "Xong bài" needs no question waiting and at least one piece of feedback (parent's rule, 26/11). */
export function finishReady(a: { waiting: number; hasFeedback: boolean }): { ready: boolean; missing: ("grade" | "feedback")[] } {
  const missing: ("grade" | "feedback")[] = [];
  if (a.waiting > 0) missing.push("grade");
  if (!a.hasFeedback) missing.push("feedback");
  return { ready: missing.length === 0, missing };
}
