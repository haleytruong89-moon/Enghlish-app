import Link from "next/link";
import { roadmapCopy } from "@/lib/copy/vi";
import type { Strip } from "@/lib/roadmap/strip";
import type { UnitState } from "@/lib/roadmap/shape";

const DOT: Record<UnitState, string> = {
  done: "bg-accent border-accent",
  in_progress: "bg-white border-accent shadow-[inset_0_0_0_3px_#e3ece8]",
  not_started: "bg-[#eef0ea] border-line",
  skipped: "border-dashed border-[#9aa09b] bg-[repeating-linear-gradient(45deg,#fff,#fff_2px,#d9dcd3_2px,#d9dcd3_4px)]",
};
const S = roadmapCopy.strip;

function Flag({ draft }: { draft: boolean }) {
  return (
    <svg viewBox="0 0 16 20" width="14" height="18" aria-hidden="true" className={draft ? "text-[#6e3410]" : "text-accent"}>
      <line x1="3" y1="1" x2="3" y2="19" stroke="currentColor" strokeWidth="2" strokeDasharray={draft ? "3 2" : undefined} />
      <polygon points="3,2 15,6 3,10" fill={draft ? "#fff" : "currentColor"} stroke="currentColor" strokeWidth="1.5" strokeDasharray={draft ? "3 2" : undefined} />
    </svg>
  );
}

function Peak({ draft }: { draft: boolean }) {
  return (
    <svg viewBox="0 0 30 24" width="30" height="24" aria-hidden="true" className={draft ? "text-[#6e3410]" : "text-accent"}>
      <polygon points="15,2 28,22 2,22" fill={draft ? "#fff" : "currentColor"} stroke="currentColor" strokeWidth="1.8" strokeDasharray={draft ? "3.2 2.2" : undefined} />
    </svg>
  );
}

/**
 * "Đường lên đỉnh" preview of the tutor page: view only. Units and their states come from the Giáo trình (edit there); flags sit at their
 * Unit (solid = confirmed, dashed = draft); the summit is the last cell. The strip is a picture for sighted users: it carries one
 * sentence for screen readers and a title on every dot / flag; the editable list below it is the accessible version.
 */
export function PathStrip({ strip, curriculaHref }: { strip: Strip | null; curriculaHref: string }) {
  if (strip === null) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="strip-title" data-testid="path-strip-empty">
        <h2 id="strip-title" className="text-lg font-semibold">{S.title}</h2>
        <p className="mt-1 text-sm text-muted">{S.noCurriculum}</p>
      </section>
    );
  }
  const c = strip.counts;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" aria-labelledby="strip-title" data-testid="path-strip">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="strip-title" className="text-lg font-semibold">{S.title}</h2>
        <span className="text-sm text-muted">{S.viewOnly} · {strip.curriculumTitle}</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div role="img" aria-label={S.aria(strip.cells.length, c.done, c.in_progress, c.skipped, strip.flagCount)} className="flex min-w-[640px] items-end border-b-2 border-line">
          {strip.cells.map((cell) => (
            <div key={cell.code} className="flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1" data-testid={`strip-unit-${cell.code}`} data-state={cell.state}>
              <div className="flex min-h-[26px] flex-col-reverse items-center gap-0.5">
                {cell.flags.map((f) => (
                  <span key={f.milestoneId} className="inline-flex leading-none" title={S.flagTitle(roadmapCopy.kinds[f.kind], f.title, f.draft)} data-testid={`strip-flag-${f.milestoneId}`} data-draft={f.draft ? "1" : "0"}><Flag draft={f.draft} /></span>
                ))}
              </div>
              <span className={`inline-block size-3.5 rounded-full border-2 ${DOT[cell.state]}`} title={S.unitTitle(cell.ord, cell.title, S.states[cell.state])} />
              <span className="pb-1 text-[10.5px] tabular-nums text-muted">{cell.ord}</span>
            </div>
          ))}
          <div className="flex min-w-[40px] flex-[1.6] flex-col items-center justify-end gap-1" data-testid="strip-summit">
            <div className="flex min-h-[26px] items-end">
              {strip.summit ? <span title={S.flagTitle(S.summit, strip.summit.title, strip.summit.draft)} data-draft={strip.summit.draft ? "1" : "0"}><Peak draft={strip.summit.draft} /></span> : null}
            </div>
            <span className="pb-1 text-[10.5px] text-muted">{S.summit}</span>
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={S.legendLabel}>
        {(["done", "in_progress", "not_started", "skipped"] as const).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5"><i className={`inline-block size-3.5 rounded-full border-2 ${DOT[k]}`} />{S.states[k]}</li>
        ))}
        <li className="inline-flex items-center gap-1.5"><Flag draft={false} />{S.flagConfirmed}</li>
        <li className="inline-flex items-center gap-1.5"><Flag draft />{S.flagDraft}</li>
      </ul>
      {strip.unplaced.length > 0 ? <p className="text-sm text-muted" data-testid="strip-unplaced">{S.unplaced(strip.unplaced.map((f) => f.title).join(", "))}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">{S.source}</span>
        <Link href={curriculaHref} className="inline-flex min-h-11 items-center font-medium text-accent underline">{S.openCurricula}</Link>
      </div>
    </section>
  );
}
