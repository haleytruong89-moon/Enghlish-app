/** Which questions use a passage, as a short range list ("1–10", "1–3, 7"). Pure; for the tutor's draft editor. */
import type { StudioItem } from "./schema";

export function passageItemRanges(items: readonly Pick<StudioItem, "n" | "passage_ref">[], ref: string): string {
  const ns = [...new Set(items.filter((i) => i.passage_ref === ref).map((i) => i.n))].sort((a, b) => a - b);
  const out: string[] = [];
  for (let k = 0; k < ns.length; ) {
    let j = k;
    while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++;
    out.push(j === k ? `${ns[k]}` : `${ns[k]}–${ns[j]}`);
    k = j + 1;
  }
  return out.join(", ");
}
