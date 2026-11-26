import { fallbackLabels, resultsCopy as c } from "@/lib/copy/vi";
import type { Overview } from "@/lib/results/overview";
import { pct, type TagAgg, type UnitScore, type WorkScore } from "@/lib/results/score";
import { OverviewView } from "./OverviewView";
import { Score } from "./Score";

/** Hướng B: Tiến bộ › Tổng quan · Theo Unit · Mục kiến thức (the 4th tab, Cấp và kỹ năng, is the Hồ sơ cấp page). */
export const RESULT_TABS = ["overview", "unit", "tag"] as const;
export type ResultTab = (typeof RESULT_TABS)[number];
/** Anything else (the old "?tab=work" included) opens Tổng quan. */
export const parseResultTab = (v: unknown): ResultTab => (typeof v === "string" && (RESULT_TABS as readonly string[]).includes(v) ? (v as ResultTab) : "overview");

function UnitList({ units }: { units: UnitScore[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="results-units">
      {units.map((u) => (
        <li key={u.key} data-testid={`results-unit-${u.key}`} className="grid gap-2 rounded-xl border border-line bg-white px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
          <span>
            <b>{u.key}</b>
            <span className="block text-sm text-muted">{c.unitWorks(u.works)}</span>
          </span>
          <Score t={u.tally} label={u.key} wide />
          <span className="text-sm">
            {u.weakest ? (
              <>
                <span className="text-muted">{c.cols.weakest}: </span>
                {u.weakest.part.name} — {c.score(u.weakest.part.tally.correct, u.weakest.part.tally.decided)} ({c.percent(pct(u.weakest.part.tally) ?? 0)})
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TagList({ tags, labels }: { tags: TagAgg[]; labels: Readonly<Record<string, string>> }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="results-tags">
      {tags.map((t) => (
        <li key={t.key} data-testid={`results-tag-${t.key}`} className="grid gap-2 rounded-xl border border-line bg-white px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
          <span>
            <b>{labels[t.key] ?? fallbackLabels.tag}</b>
            <span className="block text-sm text-muted">{c.tagWorks(t.works)}</span>
          </span>
          <Score t={t.tally} label={labels[t.key] ?? fallbackLabels.tag} wide />
        </li>
      ))}
    </ul>
  );
}

/** The views of Tiến bộ. Presentational; the page loads the data after the gate. The tab row is the page's (SectionTabs). */
export function ResultsView({ learnerId, tab, works, units, tags, tagLabels, overview }: {
  learnerId: string; tab: ResultTab; works: WorkScore[]; units: UnitScore[]; tags: TagAgg[]; tagLabels: Readonly<Record<string, string>>; overview?: Overview;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="results-view" data-tab={tab}>
      {tab !== "overview" ? (
        <p className="flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true">
          <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#b4402c]" />{c.legend.low}</span>
          <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#d9a43a]" />{c.legend.mid}</span>
          <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#2f7d4f]" />{c.legend.high}</span>
        </p>
      ) : null}
      {tab === "overview" && overview ? <OverviewView learnerId={learnerId} overview={overview} works={works} units={units} tagLabels={tagLabels} /> : null}
      {tab !== "overview" && works.length === 0 ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="results-empty">{c.empty}</p> : null}
      {works.length > 0 && tab === "unit" ? <UnitList units={units} /> : null}
      {works.length > 0 && tab === "tag" ? <TagList tags={tags} labels={tagLabels} /> : null}
    </div>
  );
}
