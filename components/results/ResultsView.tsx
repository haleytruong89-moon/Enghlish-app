import Link from "next/link";
import { fallbackLabels, resultsCopy as c } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDay } from "@/lib/review/format";
import { RESULT_RULES } from "@/lib/results/actions";
import { pct, ratio, type TagAgg, type Tally, type UnitScore, type WorkScore } from "@/lib/results/score";

export const RESULT_TABS = ["work", "unit", "tag"] as const;
export type ResultTab = (typeof RESULT_TABS)[number];
export const parseResultTab = (v: unknown): ResultTab => (typeof v === "string" && (RESULT_TABS as readonly string[]).includes(v) ? (v as ResultTab) : "work");

function barColor(t: Tally): string {
  const r = ratio(t);
  if (r === null) return "bg-[#c9c5bc]";
  if (r < RESULT_RULES.fixTogetherBelow) return "bg-[#b4402c]";
  if (r < RESULT_RULES.praiseFrom) return "bg-[#d9a43a]";
  return "bg-[#2f7d4f]";
}

/** "đúng 16/39 (41%)" + a bar; "· 1 câu chờ thầy/cô" when something waits. */
function Score({ t, label, wide = false }: { t: Tally; label: string; wide?: boolean }) {
  const p = pct(t);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-sm tabular-nums">
        {t.decided > 0 ? (
          <>
            <b>{c.score(t.correct, t.decided)}</b> ({c.percent(p ?? 0)})
          </>
        ) : (
          <span className="text-muted">{c.noneDecided}</span>
        )}
        {t.pending > 0 ? <span className="ml-1 font-semibold text-[#6b4600]">· {c.pending(t.pending)}</span> : null}
      </span>
      <span role="img" aria-label={c.barLabel(label, t.correct, t.decided)} className={`block h-2 overflow-hidden rounded-full bg-[#eceee8] ${wide ? "w-full" : "w-40 max-w-full"}`}>
        <span className={`block h-full ${barColor(t)}`} style={{ width: `${t.decided > 0 ? Math.round((t.correct * 100) / t.decided) : 0}%` }} />
      </span>
    </span>
  );
}

function WorkList({ works }: { works: WorkScore[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="results-works">
      {works.map((w) => (
        <li key={w.instanceId} data-testid={`results-work-${w.instanceId}`} className="flex flex-col gap-2 rounded-xl border border-line bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{w.title}</p>
              <p className="text-sm text-muted">
                {formatDay(todayVn(new Date(w.submittedAt)))} · {c.waiting(w.waitingDays)}
                {w.unitKey ? ` · ${w.unitKey}` : ""}
                {w.attempts > 1 ? ` · ${c.attempts(w.attempts)}` : ""}
                {w.counted ? "" : ` · ${c.notCounted}`}
                {w.feedbackReady ? (w.feedbackGiven ? ` · ${c.feedbackGiven}` : "") : ""}
                {w.feedbackReady && !w.feedbackGiven ? <b className="text-[#b4402c]"> · {c.feedbackMissing}</b> : null}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-full bg-[#eceee8] px-2.5 py-0.5 text-xs font-semibold">{w.official ? c.official : c.provisional}</span>
              <Score t={w.tally} label={w.title} />
            </div>
          </div>
          {w.parts.length > 1 ? (
            <div className="grid gap-2 border-t border-[#eceee8] pt-2 sm:grid-cols-2" aria-label={c.cols.parts}>
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
        </li>
      ))}
    </ul>
  );
}

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

/** The three views of "Kết quả". Presentational; the page loads the data after the gate. */
export function ResultsView({ learnerId, tab, works, units, tags, tagLabels }: {
  learnerId: string; tab: ResultTab; works: WorkScore[]; units: UnitScore[]; tags: TagAgg[]; tagLabels: Readonly<Record<string, string>>;
}) {
  const base = `/learners/${learnerId}/progress`;
  return (
    <div className="flex flex-col gap-3" data-testid="results-view" data-tab={tab}>
      <nav aria-label={c.tabsLabel} className="flex flex-wrap gap-2">
        {RESULT_TABS.map((t) => (
          <Link key={t} href={t === "work" ? base : `${base}?tab=${t}`} aria-current={t === tab ? "page" : undefined} data-testid={`results-tab-${t}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${t === tab ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}>
            {c.tabs[t]}
          </Link>
        ))}
      </nav>
      <p className="flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true">
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#b4402c]" />{c.legend.low}</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#d9a43a]" />{c.legend.mid}</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#2f7d4f]" />{c.legend.high}</span>
      </p>
      {works.length === 0 ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="results-empty">{c.empty}</p> : null}
      {works.length > 0 && tab === "work" ? <WorkList works={works} /> : null}
      {works.length > 0 && tab === "unit" ? <UnitList units={units} /> : null}
      {works.length > 0 && tab === "tag" ? <TagList tags={tags} labels={tagLabels} /> : null}
    </div>
  );
}
