import { resultsCopy as c } from "@/lib/copy/vi";
import { RESULT_RULES } from "@/lib/results/actions";
import { pct, ratio, type Tally } from "@/lib/results/score";

export function barColor(t: Tally): string {
  const r = ratio(t);
  if (r === null) return "bg-[#c9c5bc]";
  if (r < RESULT_RULES.fixTogetherBelow) return "bg-[#b4402c]";
  if (r < RESULT_RULES.praiseFrom) return "bg-[#d9a43a]";
  return "bg-[#2f7d4f]";
}

/** "đúng 16/39 (41%)" + a bar; "· 1 câu chờ thầy/cô" when something waits. */
export function Score({ t, label, wide = false }: { t: Tally; label: string; wide?: boolean }) {
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

