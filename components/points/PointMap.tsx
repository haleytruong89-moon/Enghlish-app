// components/points/PointMap.tsx
import { pointMapCopy } from "@/lib/copy/vi";
import { dayLabel } from "@/lib/levels/view";
import type { PointMap as PointMapData, PointMapRow } from "@/lib/points/types";
import { groupPointMap, pointLevel, pointScaleCells } from "@/lib/points/view";
import { STATE_LEVEL } from "@/lib/engine/points/types";

/**
 * Bản đồ kiến thức (staff only): mảng › nhóm › điểm, each point with the 4-cell scale WITH words (never colour alone), who set the level, the
 * waiting proposal / ⚑, where the book teaches it, and every counted answer as Đúng / Sai (never a raw score).
 */
export function PointMap({ map }: { map: PointMapData }) {
  const domains = groupPointMap(map.points);
  if (domains.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="point-map-empty">
        {pointMapCopy.empty}
      </p>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-8" data-testid="point-map">
      {domains.map((d) => (
        <section key={d.key} aria-labelledby={`pm-domain-${d.key}`} data-testid={`point-domain-${d.key}`}>
          <h2 id={`pm-domain-${d.key}`} className="text-xl font-semibold">
            {d.name}
          </h2>
          {d.groups.map((g) => (
            <div key={g.key} className="mt-4" data-testid={`point-group-${g.key}`}>
              <h3 className="text-base font-semibold text-muted">{g.name}</h3>
              <ul className="mt-2 grid gap-3 xl:grid-cols-2">
                {g.points.map((p) => (
                  <PointCard key={p.tagKey} p={p} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function PointCard({ p }: { p: PointMapRow }) {
  const level = STATE_LEVEL[p.state];
  return (
    <li id={`point-${p.tagKey}`} className="scroll-mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid={`point-row-${p.tagKey}`} data-level={level}>
      <p className="font-semibold">{p.titleVi ?? p.tagKey}</p>
      <ol className="mt-2 grid grid-cols-4 gap-1" aria-label={pointLevel(p.state)}>
        {pointScaleCells(p.state).map((cell) => (
          <li
            key={cell.state}
            aria-current={cell.current ? "step" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md border px-1 text-center text-[11px] leading-tight ${
              cell.filled ? "border-accent bg-[#E3ECE8] font-semibold text-ink" : "border-dashed border-line text-muted"
            }`}
          >
            {cell.label}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {p.flag ? (
          <span data-testid="point-flag" className="rounded-full border border-[#B4690E] bg-[#FBF1DC] px-2 py-0.5 text-[#6B4600]">
            {pointMapCopy.flagChip}
          </span>
        ) : null}
        {p.proposal ? (
          <span data-testid="point-pending" className="rounded-full border border-accent px-2 py-0.5">
            {pointMapCopy.pendingTo(pointLevel(p.proposal.toState))}
          </span>
        ) : null}
        {p.stateKind === "AUTO" ? <span className="text-muted">{pointMapCopy.autoNote}</span> : null}
        {p.stateKind === "CONFIRMED" || p.stateKind === "MANUAL" ? <span className="text-muted">{pointMapCopy.confirmedNote}</span> : null}
        {p.stateSince ? <span className="text-muted">{pointMapCopy.since(dayLabel(p.stateSince))}</span> : null}
      </div>
      {p.curricula.length > 0 ? <p className="mt-2 text-xs text-muted">{pointMapCopy.inBook(p.curricula.map((c) => c.title).join(", "))}</p> : null}
      <details className="mt-2" data-testid={`point-evidence-${p.tagKey}`}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-accent underline">
          {pointMapCopy.evidence} · {pointMapCopy.evidenceCount(p.answers.length)}
        </summary>
        {p.answers.length === 0 ? (
          <p className="text-sm text-muted">{pointMapCopy.evidenceNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {p.answers.map((a) => (
              <li key={a.ref} data-testid="point-answer" data-correct={a.correct ? "true" : "false"}>
                <span className="font-semibold">{a.correct ? pointMapCopy.correct : pointMapCopy.wrong}</span> · {a.title ?? "-"} · {dayLabel(a.at)}
                {a.support ? <span className="text-muted"> · {pointMapCopy.support}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
