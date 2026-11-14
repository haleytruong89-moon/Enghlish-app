import { journeyCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import type { Journey, JourneyNode } from "@/lib/journey/path";

const dot: Record<JourneyNode["status"], string> = {
  done: "border-accent bg-accent text-white",
  in_progress: "border-accent bg-white text-accent",
  not_started: "border-line bg-white text-muted",
  skipped: "border-line bg-line text-muted",
};

/** The same mountain as a list for screen readers and small screens: read from the bottom up; every row has words, not only colour. */
export function PathList({ journey }: { journey: Journey }) {
  const rows: React.ReactNode[] = [];
  journey.nodes.forEach((n) => {
    const here = n.climber === "here";
    rows.push(
      <li key={n.code} data-testid={`path-unit-${n.code}`} data-status={n.status} className={`flex min-h-11 items-start gap-3 rounded-xl px-3 py-2 ${here ? "border-2 border-accent bg-white" : ""}`}>
        <span aria-hidden="true" className={`mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${dot[n.status]}`}>{n.status === "done" ? "✓" : n.status === "in_progress" ? "•" : ""}</span>
        <span className="flex min-w-0 flex-col">
          {here ? <span className="mb-1 w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{journeyCopy.here}</span> : null}
          {n.climber === "justDone" ? <span className="mb-1 w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{journeyCopy.justDone}</span> : null}
          <b className={n.status === "skipped" ? "font-medium text-muted" : "font-semibold"}>{n.title}</b>
          <span className="text-sm text-muted">{n.status === "done" && n.doneOn ? journeyCopy.doneOn(formatDateVi(n.doneOn)) : journeyCopy.unitStatus[n.status]}</span>
        </span>
      </li>,
    );
    n.flags.forEach((f) =>
      rows.push(
        <li key={`flag-${f.id}`} data-testid={`path-flag-${f.id}`} className="flex min-h-11 items-start gap-3 rounded-xl bg-[#fbf1e4] px-3 py-2">
          <span aria-hidden="true" className="mt-1 inline-flex size-6 shrink-0 items-center justify-center text-base">⚑</span>
          <span className="flex min-w-0 flex-col">
            <b className="font-semibold text-[#7a4a12]">{f.title}</b>
            <span className="text-sm text-muted">{f.reached ? journeyCopy.flagReached : journeyCopy.remainToFlag(f.remaining)}</span>
          </span>
        </li>,
      ),
    );
  });
  const top: React.ReactNode[] = [];
  top.push(
    <li key="summit" data-testid="path-summit" className="flex min-h-11 items-start gap-3 rounded-xl bg-[#e3ece8] px-3 py-2">
      <span aria-hidden="true" className="mt-1 inline-flex size-6 shrink-0 items-center justify-center text-base">▲</span>
      <span className="flex min-w-0 flex-col">
        <b className="font-bold text-accent">{journey.summit ? journey.summit.title : journeyCopy.summitUnnamed}</b>
        <span className="text-sm text-muted">
          {journey.summit ? `${journey.summit.targetMonth ? `${journeyCopy.month(journey.summit.targetMonth, journey.summit.approx)} · ` : ""}${journeyCopy.summit}` : journeyCopy.summitUnnamedShort}
        </span>
      </span>
    </li>,
  );
  journey.beyond.forEach((b) =>
    top.unshift(
      <li key={`beyond-${b.id}`} data-testid={`path-beyond-${b.id}`} className="flex min-h-11 items-start gap-3 rounded-xl border border-dashed border-line px-3 py-2">
        <span aria-hidden="true" className="mt-1 inline-flex size-6 shrink-0 items-center justify-center text-base">☁</span>
        <span className="flex min-w-0 flex-col">
          <b className="font-semibold text-muted">{b.title}</b>
          <span className="text-sm text-muted">{b.targetMonth ? `${journeyCopy.beyond} · ${journeyCopy.month(b.targetMonth, b.approx)}` : journeyCopy.beyond}</span>
        </span>
      </li>,
    ),
  );
  const ordered = [...top, ...[...rows].reverse()];
  return (
    <div tabIndex={0} aria-label={journeyCopy.listLabel} data-testid="path-list" className="max-h-[620px] overflow-auto rounded-xl border border-line bg-paper p-2">
      <ol className="flex flex-col gap-1">{ordered}</ol>
      <p className="px-3 pb-1 pt-2 text-sm text-muted">{journeyCopy.listFoot}</p>
    </div>
  );
}
