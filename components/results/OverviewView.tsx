import { fallbackLabels, resultsCopy as c } from "@/lib/copy/vi";
import { pct, type UnitScore, type WorkScore } from "@/lib/results/score";
import type { Overview } from "@/lib/results/overview";
import { FirstTryChart } from "./FirstTryChart";
import { Score } from "./Score";
import { WorkList } from "./WorkList";

const O = c.overview;
function Tile({ id, label, value, line }: { id: string; label: string; value: string; line: string | null }) {
  return (
    <div data-testid={id} className="flex flex-col gap-0.5 rounded-xl border border-line bg-white px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {line ? <span className="text-xs text-muted">{line}</span> : null}
    </div>
  );
}

/** Tiến bộ › Tổng quan: four numbers, the chart, Units, weakest / strongest items, then every work on one line. */
export function OverviewView({ learnerId, overview: o, works, units, tagLabels }: { learnerId: string; overview: Overview; works: WorkScore[]; units: UnitScore[]; tagLabels: Readonly<Record<string, string>> }) {
  const name = (k: string) => tagLabels[k] ?? fallbackLabels.tag;
  const list = (ts: Overview["weakest"]) => (ts.length ? ts.map((t) => `${name(t.key)} ${pct(t.tally)} %`).join(" · ") : O.none);
  return (
    <div className="flex flex-col gap-4" data-testid="results-overview" data-learner={learnerId}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-tiles">
        <Tile id="tile-sent" label={O.sent} value={String(o.sent.now)} line={O.sentBefore(o.sent.before)} />
        <Tile id="tile-firsttry" label={O.firstTry} value={o.firstTry.now === null ? O.unknown : `${o.firstTry.now} %`} line={o.firstTry.diff === null ? null : O.diff(o.firstTry.diff)} />
        <Tile id="tile-waiting" label={O.waiting} value={O.waitingWorks(o.waiting.works)} line={o.waiting.oldestDays === null ? null : O.oldest(o.waiting.oldestDays)} />
        <Tile id="tile-unit" label={O.unit} value={o.main?.currentCode ?? O.unknown} line={o.main ? O.unitDone(o.main.done, o.main.total) : null} />
      </div>
      <FirstTryChart points={o.points} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-4" data-testid="overview-units">
          <h2 className="text-sm font-semibold">{O.unitsTitle}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {units.filter((u) => /^U\d+$/.test(u.key)).slice(-6).map((u) => (
              <li key={u.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2"><b>{u.key}</b><Score t={u.tally} label={u.key} wide /></li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-white p-4 text-sm" data-testid="overview-tags">
          <h2 className="font-semibold">{O.tagsTitle}</h2>
          <p className="mt-2"><b className="text-[#8a3322]">{O.weakest}</b> {list(o.weakest)}</p>
          <p className="mt-1"><b className="text-[#24613d]">{O.strongest}</b> {list(o.strongest)}</p>
        </section>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{O.worksTitle}</h2>
        {works.length === 0 ? <p className="text-sm text-muted">{c.empty}</p> : <WorkList works={works} />}
      </section>
    </div>
  );
}
