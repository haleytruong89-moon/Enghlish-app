import Link from "next/link";
import { resultsCopy as c } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDay } from "@/lib/review/format";
import type { WorkScore } from "@/lib/results/score";
import { Score } from "./Score";

/** Every work on one line (day, title, score); a click folds out each part and the link to the work (hướng B, Tiến bộ › Tổng quan). */
export function WorkList({ works }: { works: WorkScore[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="results-works">
      {works.map((w) => {
        const head = (
          <>
              <span className="min-w-0 text-left">
                <span className="block font-semibold">{w.title}</span>
                <span className="block text-sm text-muted">
                  {formatDay(todayVn(new Date(w.submittedAt)))} · {c.waiting(w.waitingDays)}
                  {w.unitKey ? ` · ${w.unitKey}` : ""}
                  {w.attempts > 1 ? ` · ${c.attempts(w.attempts)}` : ""}
                  {w.counted ? "" : ` · ${c.notCounted}`}
                  {w.feedbackReady ? (w.feedbackGiven ? ` · ${c.feedbackGiven}` : "") : ""}
                  {w.feedbackReady && !w.feedbackGiven ? <b className="text-[#b4402c]"> · {c.feedbackMissing}</b> : null}
                </span>
              </span>
              <span className="col-start-2 flex w-full flex-col items-stretch gap-1 sm:col-start-3 sm:text-right" data-testid={`results-work-score-${w.instanceId}`}>
                <span className="self-start rounded-full bg-[#eceee8] px-2.5 py-0.5 text-xs font-semibold sm:self-end">{w.official ? c.official : c.provisional}</span>
                <Score t={w.tally} label={w.title} wide />
              </span>
          </>
        );
        const hasBody = w.parts.length > 0 || w.episodeId !== null;
        // Bản 3 (26/11): fixed columns, so every title starts at the left edge and every score lines up on the right.
        const ROW = "grid min-h-11 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[1rem_minmax(0,1fr)_15rem]";
        return (
        <li key={w.instanceId} data-testid={`results-work-${w.instanceId}`} className="rounded-xl border border-line bg-white">
          {hasBody ? (
          <details className="group">
            <summary className={`${ROW} cursor-pointer list-none`}>
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">▸</span>
              {head}
            </summary>
            <div className="flex flex-col gap-2 border-t border-[#eceee8] px-4 py-3">
              {w.parts.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2" aria-label={c.cols.parts}>
                  {w.parts.map((p) => (
                    <div key={p.key} className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm text-muted" title={p.name}>{p.key === p.name ? p.key : `${p.key} · ${p.name}`}</span>
                      <Score t={p.tally} label={p.name} />
                    </div>
                  ))}
                </div>
              ) : null}
              {w.episodeId ? (
                <Link href={`/review/${w.episodeId}`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent underline">{c.openWork}</Link>
              ) : null}
            </div>
          </details>
          ) : (
            <div className={ROW}><span aria-hidden="true" />{head}</div>
          )}
        </li>
        );
      })}
    </ul>
  );
}
