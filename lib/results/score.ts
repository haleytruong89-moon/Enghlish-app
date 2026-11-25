/**
 * "Kết quả" (26/11, after the 25/11 audit): what the child got right in each Studio test, by part, by Unit and by knowledge item, so
 * the tutor sees the performance behind each piece of work. Pure.
 *
 * Measurement rules kept: only the FIRST attempt of a test is counted (a retry is practice); a question only the paper holds is left
 * out; a question the app could not check counts as "pending" (never right, never wrong) until an adult decides it; a blank counts
 * as not right. The child never sees any of this (D35) — adults only.
 */

export type ItemState = "correct" | "incorrect" | "blank" | "pending";
export type ItemRow = { id: string; n: number; part: string | null; tag: string | null; kind: string; state: ItemState };
/** correct ≤ decided; decided = correct + incorrect + blank; pending = waiting for an adult. */
export type Tally = { correct: number; decided: number; pending: number };
export type PartScore = { key: string; name: string; tally: Tally };
export type TagScore = { key: string; tally: Tally };

export type AutoChecks = { items?: Record<string, { kind?: string; result?: string }> } | null;
export type ItemMeta = { n: number; part: string | null; tag: string | null; outOfApp: boolean };

const ZERO: Tally = { correct: 0, decided: 0, pending: 0 };
export const add = (a: Tally, b: Tally): Tally => ({ correct: a.correct + b.correct, decided: a.decided + b.decided, pending: a.pending + b.pending });
/** Share right among the decided questions, 0–1; null when nothing is decided. */
export const ratio = (t: Tally): number | null => (t.decided > 0 ? t.correct / t.decided : null);
export const pct = (t: Tally): number | null => {
  const r = ratio(t);
  return r === null ? null : Math.round(r * 100);
};

const tallyOf = (rows: readonly ItemRow[]): Tally =>
  rows.reduce<Tally>((t, r) => (r.state === "pending" ? { ...t, pending: t.pending + 1 } : { ...t, decided: t.decided + 1, correct: t.correct + (r.state === "correct" ? 1 : 0) }), ZERO);

const qn = (id: string): number => Number(/^q(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * The questions of one attempt as they stand now: the app's check, or the adult's Đúng/Sai for a question the app left to a person.
 * Questions only on paper (studio_item_meta.out_of_app) are left out.
 */
export function scoreItems(checks: AutoChecks, decisions: ReadonlyMap<string, "correct" | "incorrect">, meta: ReadonlyMap<string, ItemMeta>): ItemRow[] {
  const out: ItemRow[] = [];
  for (const [id, c] of Object.entries(checks?.items ?? {})) {
    const m = meta.get(id);
    if (m?.outOfApp) continue;
    const r = c?.result;
    let state: ItemState;
    if (r === "correct" || r === "incorrect" || r === "blank") state = r;
    else state = decisions.get(id) ?? "pending";
    out.push({ id, n: m?.n ?? qn(id), part: m?.part ?? null, tag: m?.tag ?? null, kind: c?.kind ?? "", state });
  }
  return out.sort((a, b) => a.n - b.n);
}

export type WorkInput = {
  instanceId: string;
  activityId: string;
  title: string;
  units: readonly string[];
  submittedAt: string;
  attempts: number;
  firstAttemptId: string;
  lastAttemptId: string | null;
  episodeId: string | null;
  feedbackGiven: boolean;
  feedbackReady: boolean;
  official: { correct: number; total: number } | null;
  /** false for a test given again (its first attempt here is not the child's first attempt at this test): shown, not counted. */
  counted?: boolean;
  items: readonly ItemRow[];
  /** Part key → its name as the test calls it ("Adjectives and adverbs"). */
  partNames: ReadonlyMap<string, string>;
};

export type WorkScore = Omit<WorkInput, "items" | "partNames" | "counted"> & {
  counted: boolean;
  unitKey: string | null;
  tally: Tally;
  parts: PartScore[];
  tags: TagScore[];
  /** Whole days since the first attempt was sent (Vietnam days), for "chờ n ngày". */
  waitingDays: number;
  /** Something is still the adult's to do: a question to decide, or feedback not given. */
  needsAdult: boolean;
};

/**
 * A Review / Progress Test keeps its own name, even when it was given with its Units ("Giao theo Unit" saves them for a Review row);
 * else "U14" from the Units given with the test; else from the title ("… Unit 14 …").
 */
export function unitKeyOf(units: readonly string[], title: string): string | null {
  const r = /\breview\s*(\d{1,2})\b/i.exec(title);
  if (r) return `Review ${Number(r[1])}`;
  const p = /\bprogress test\s*(\d{1,2})\b/i.exec(title);
  if (p) return `Progress Test ${Number(p[1])}`;
  const own = units.find((u) => /^U\d+$/.test(u));
  if (own) return own;
  const m = /\bunits?\s*(\d{1,2})\b(?!\s*[–-]\s*\d)/i.exec(title);
  return m ? `U${Number(m[1])}` : null;
}

const dayMs = 86_400_000;
const vnDay = (iso: string): number => Math.floor((Date.parse(iso) + 7 * 3_600_000) / dayMs);

export function scoreWork(w: WorkInput, todayIso: string): WorkScore {
  const { items, partNames, counted, ...rest } = w;
  const byPart = new Map<string, ItemRow[]>();
  const byTag = new Map<string, ItemRow[]>();
  for (const r of items) {
    if (r.part) byPart.set(r.part, [...(byPart.get(r.part) ?? []), r]);
    if (r.tag) byTag.set(r.tag, [...(byTag.get(r.tag) ?? []), r]);
  }
  const tally = tallyOf(items);
  const today = Math.floor(Date.parse(`${todayIso}T00:00:00Z`) / dayMs);
  return {
    ...rest,
    counted: counted ?? true,
    unitKey: unitKeyOf(w.units, w.title),
    tally,
    parts: [...byPart.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({ key, name: partLabel(key, partNames.get(key) ?? key), tally: tallyOf(rows) })),
    tags: [...byTag.entries()].map(([key, rows]) => ({ key, tally: tallyOf(rows) })),
    waitingDays: Math.max(0, today - vnDay(w.submittedAt)),
    needsAdult: tally.pending > 0 || (w.feedbackReady && !w.feedbackGiven),
  };
}

/** "E · Complete with an appropriate comparative…" → a short label: the key, then the name cut at a word near 40 characters. */
export function partLabel(key: string, name: string, max = 40): string {
  const n = name.trim();
  if (!n || n === key) return key;
  const short = n.length <= max ? n : `${n.slice(0, max).replace(/\s+\S*$/, "")}…`;
  return n.startsWith(`${key} `) || n.startsWith(`${key}·`) ? short : `${key} · ${short}`;
}

export type UnitScore = { key: string; tally: Tally; works: number; weakest: { title: string; part: PartScore } | null; lastAt: string };
export type TagAgg = { key: string; tally: Tally; works: number };

/** Unit order: U1 < U2 < … < U26, then Reviews, then Progress Tests, then anything else. */
function unitOrder(k: string): number {
  const u = /^U(\d+)$/.exec(k);
  if (u) return Number(u[1]);
  const r = /^Review (\d+)$/.exec(k);
  if (r) return 1000 + Number(r[1]);
  const p = /^Progress Test (\d+)$/.exec(k);
  if (p) return 2000 + Number(p[1]);
  return 9999;
}

export function byUnit(works: readonly WorkScore[], minItems: number): UnitScore[] {
  const groups = new Map<string, WorkScore[]>();
  for (const w of works) if (w.unitKey) groups.set(w.unitKey, [...(groups.get(w.unitKey) ?? []), w]);
  return [...groups.entries()]
    .map(([key, ws]) => {
      let weakest: UnitScore["weakest"] = null;
      for (const w of ws) for (const p of w.parts) {
        const r = ratio(p.tally);
        if (r === null || p.tally.decided < minItems) continue;
        if (!weakest || r < (ratio(weakest.part.tally) ?? 1)) weakest = { title: w.title, part: p };
      }
      return { key, tally: ws.map((w) => w.tally).reduce(add, ZERO), works: ws.length, weakest, lastAt: ws.map((w) => w.submittedAt).sort().at(-1) ?? "" };
    })
    .sort((a, b) => unitOrder(a.key) - unitOrder(b.key) || a.key.localeCompare(b.key));
}

export function byTag(works: readonly WorkScore[]): TagAgg[] {
  const out = new Map<string, TagAgg>();
  for (const w of works) for (const t of w.tags) {
    const cur = out.get(t.key) ?? { key: t.key, tally: ZERO, works: 0 };
    out.set(t.key, { key: t.key, tally: add(cur.tally, t.tally), works: cur.works + 1 });
  }
  return [...out.values()].sort((a, b) => (ratio(a.tally) ?? 2) - (ratio(b.tally) ?? 2) || a.key.localeCompare(b.key));
}
