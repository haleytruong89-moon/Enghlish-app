import { weakPage, weakSourceLabels } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { itemList } from "@/lib/tutorwork/frameScore";
import { WEAK_SOURCES, type WeakPoint, type WeakPointsView } from "@/lib/tutorwork/types";

const STATUS_STYLE: Record<WeakPoint["status"], string> = {
  repeat: "bg-[#7a4a00] text-white",
  watch: "bg-[#fbf0dc] text-[#5a3a06]",
  ok: "bg-[#E3ECE8] text-[#1F4439]",
};

function statusLabel(s: WeakPoint["status"]): string {
  return s === "repeat" ? weakPage.statusRepeat : s === "watch" ? weakPage.statusWatch : weakPage.statusOk;
}

function RecheckLine({ t, policyDays }: { t: WeakPoint; policyDays: number | null }) {
  if (policyDays === null) return <p className="text-sm text-muted">{weakPage.recheckNoPolicy}</p>;
  return (
    <div className="text-sm" data-testid={`recheck-info-${t.tagKey}`}>
      <p className="font-medium">
        {weakPage.recheck}:{" "}
        {t.recheckDueOn ? (t.recheckDue ? weakPage.recheckDue(formatDateVi(t.recheckDueOn)) : weakPage.recheckWaiting(formatDateVi(t.recheckDueOn))) : "—"}
      </p>
      <p className="text-muted">{weakPage.recheckRule(policyDays)}</p>
      {t.lastRecheck ? (
        <p className="text-muted">{weakPage.lastRecheck(weakPage.recheckResultLabels[t.lastRecheck.result], formatDateVi(t.lastRecheck.on))}</p>
      ) : null}
    </div>
  );
}

/** The table "tag × source" with a plain-HTML detail per row (no script: works the same on a phone). */
export function WeakTable({ view }: { view: WeakPointsView }) {
  if (view.tags.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white px-5 py-4" data-testid="weak-empty">
        {weakPage.empty}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="weak-table">
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="px-4 py-3 font-medium">
                {weakPage.colTag}
              </th>
              {WEAK_SOURCES.map((s) => (
                <th key={s} scope="col" className="px-2 py-3 text-center font-medium">
                  {weakSourceLabels[s]}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 font-medium">
                {weakPage.colRepeat}
              </th>
            </tr>
          </thead>
          <tbody>
            {view.tags.map((t) => (
              <tr key={t.tagKey} className="border-t border-line align-top" data-testid={`weak-row-${t.tagKey}`}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2" aria-label={`${weakPage.detailOpen}: ${t.label}`}>
                      {t.label}
                    </summary>
                    <div className="flex flex-col gap-3 pb-3 font-normal">
                      {t.asked > 0 ? <p className="text-sm text-muted">{weakPage.summary(t.askedWrong, t.asked)}</p> : null}
                      <ul className="flex flex-col gap-1 text-sm" data-testid={`weak-events-${t.tagKey}`}>
                        {t.events.map((e) => (
                          <li key={`${e.source}-${e.sourceId}`}>
                            <span className="text-muted">{formatDateVi(e.date)}</span> ·{" "}
                            {weakPage.timelineEvent(weakSourceLabels[e.source], e.title, itemList(e.items))}
                            {e.usedHint ? <span className="ml-1 rounded-full border border-line px-2 text-xs">{weakPage.hintTag}</span> : null}
                            {e.inClass ? <span className="ml-1 rounded-full border border-line px-2 text-xs">{weakPage.classTag}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <RecheckLine t={t} policyDays={view.policyDays} />
                    </div>
                  </details>
                </th>
                {WEAK_SOURCES.map((s) => (
                  <td key={s} className="px-2 py-3 text-center">
                    {t.bySource[s] > 0 ? t.bySource[s] : <span className="text-muted">·</span>}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[t.status]}`}>{statusLabel(t.status)}</span>
                  <span className="ml-2 text-xs text-muted">{weakPage.statusLine(t.sources)}</span>
                  {t.recheckDue ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{weakPage.recheck}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{weakPage.legend}</p>
    </div>
  );
}
