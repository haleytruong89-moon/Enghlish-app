/**
 * eng_my_levels / eng_my_cando / eng_my_then_now (migration 0036) → typed values. zod, STRICT: a key the database should never send to a child
 * (a score, a number level, the other child's data) is a fault, never silently shown. null in → null out (not a student / not applied).
 */
import { z } from "zod";
import type { CandoRaw } from "./cando";
import type { LevelDomainRaw } from "./levels";
import { dayVn } from "./week";
import type { ThenNowView } from "./thenNow";

const ts = z.string().min(10);

const levels = z.strictObject({
  domains: z.array(z.strictObject({ key: z.string().min(1), name: z.string().min(1), scale: z.enum(["cefr", "task_level"]), level: z.string().nullable(), on: ts.nullable() })),
});
export function parseMyLevels(input: unknown): LevelDomainRaw[] | null {
  if (input === null || input === undefined) return null;
  return levels.parse(input).domains;
}

const cando = z.strictObject({ now: ts, items: z.array(z.strictObject({ code: z.string().nullable(), name: z.string().min(1), at: ts })) });
export function parseMyCando(input: unknown): { now: string; items: CandoRaw[] } | null {
  if (input === null || input === undefined) return null;
  const r = cando.parse(input);
  return { now: r.now, items: r.items };
}

const piece = z.strictObject({ on: ts, text: z.string().min(1) });
const thenNow = z.strictObject({ then: piece, now: piece, note: z.string().nullable() });
export function parseMyThenNow(input: unknown): ThenNowView | null {
  if (input === null || input === undefined) return null;
  const r = thenNow.parse(input);
  return { then: { on: dayVn(r.then.on), text: r.then.text }, now: { on: dayVn(r.now.on), text: r.now.text }, note: r.note };
}

/** Adult side (eng_then_now_candidates): the child's own writing the tutor may pick from, plus the current pick. */
const candidate = z.strictObject({ id: z.string().min(1), at: ts, title: z.string().nullable(), preview: z.string() });
const current = z.strictObject({ id: z.string().min(1), then_attempt: z.string(), now_attempt: z.string(), note: z.string().nullable(), status: z.enum(["shown", "hidden"]), created_at: ts });
const adult = z.strictObject({ candidates: z.array(candidate), current: current.nullable() });
export type ThenNowCandidates = { candidates: { id: string; on: string; title: string | null; preview: string }[]; current: { id: string; thenId: string; nowId: string; note: string | null; status: "shown" | "hidden"; at: string } | null };
export function parseThenNowCandidates(input: unknown): ThenNowCandidates | null {
  if (input === null || input === undefined) return null;
  const r = adult.parse(input);
  return {
    candidates: r.candidates.map((c) => ({ id: c.id, on: dayVn(c.at), title: c.title, preview: c.preview })),
    current: r.current ? { id: r.current.id, thenId: r.current.then_attempt, nowId: r.current.now_attempt, note: r.current.note, status: r.current.status, at: r.current.created_at } : null,
  };
}
