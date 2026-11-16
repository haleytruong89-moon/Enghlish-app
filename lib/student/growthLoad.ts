import "server-only";
import { skillNames } from "@/lib/copy/vi";
import { createUserClient } from "@/lib/supabase/server";
import { buildCando, candoEverMap, type CandoItem } from "./cando";
import { parseMyCando, parseMyLevels, parseMyThenNow } from "./growthShape";
import { buildLevelsView, type LevelsView } from "./levels";
import type { ThenNowView } from "./thenNow";

export type MyGrowth = {
  /** null = nothing to show (migration 0036 not applied, or unreadable): the card is left out, never an error page. */
  levels: LevelsView | null;
  cando: CandoItem[] | null;
  /** Rung n → when the n-th different item was first confirmed (ledgers); empty when not available. */
  candoEver: Record<number, string>;
  thenNow: ThenNowView | null;
};

/** One of the child's own reads through the USER client (the functions identify the child by auth.uid()). Never throws: any fault → null. */
async function mine<T>(fn: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  try {
    const { data, error } = await (await createUserClient()).rpc(fn);
    if (error) return null;
    return parse(data);
  } catch {
    return null;
  }
}

export async function loadMyGrowth(): Promise<MyGrowth> {
  let candoEver: Record<number, string> = {};
  const [levels, cando, thenNow] = await Promise.all([
    mine("eng_my_levels", (raw) => {
      const d = parseMyLevels(raw);
      return d ? buildLevelsView(d) : null;
    }),
    mine("eng_my_cando", (raw) => {
      const c = parseMyCando(raw);
      if (c) candoEver = candoEverMap(c.ever);
      return c ? buildCando(c.items, c.now, skillNames) : null;
    }),
    mine("eng_my_then_now", parseMyThenNow),
  ]);
  return { levels, cando, candoEver, thenNow };
}
