import { ddmm } from "@/lib/student/week";
import { resultsCopy } from "@/lib/copy/vi";
import type { HandledItem } from "@/lib/results/decisions";

const c = resultsCopy.handled;
/** The Vietnam calendar day of a timestamp (the database stores UTC). */
const vnDay = (at: string) => new Date(Date.parse(at) + 7 * 3_600_000).toISOString().slice(0, 10);

/** "Đã xử lý": the cards marked in the last 30 days — what, by whom, how long after the work came in, and why it was skipped. */
export function HandledList({ items, ready }: { items: readonly HandledItem[]; ready: boolean }) {
  return (
    <section id="da-xu-ly" aria-labelledby="da-xu-ly-title" className="flex flex-col gap-2" data-testid="handled-list">
      <h2 id="da-xu-ly-title" className="text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-muted">{c.intro}</p>
      {!ready ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">{c.unavailable}</p> : null}
      {ready && items.length === 0 ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="handled-empty">{c.empty}</p> : null}
      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((i) => (
            <li key={`${i.cardKey}-${i.at}`} className="px-4 py-3 text-sm" data-testid={`handled-${i.decision}`}>
              <p>
                <span className="font-semibold">{i.label}</span>
              </p>
              <p className="mt-0.5 text-muted">
                {ddmm(vnDay(i.at))} · {c.by[i.byRole]} {c.decision[i.decision]}
                {c.after(i.afterDays)}
              </p>
              {i.reason ? <p className="mt-0.5">{c.reason(i.reason)}</p> : null}
              {i.reopened ? <p className="mt-0.5 font-semibold text-[#6b4600]" data-testid="handled-reopened">{c.reopened}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
