"use client";
import { useRef, useState, type PointerEvent } from "react";
import { resultsCopy } from "@/lib/copy/vi";
import { RESULT_RULES } from "@/lib/results/actions";
import type { ChartPoint } from "@/lib/results/overview";

const W = 640, H = 220, PAD = { l: 34, r: 22, t: 12, b: 28 };
const y = (p: number) => PAD.t + ((100 - p) / 100) * (H - PAD.t - PAD.b);
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const C = resultsCopy.overview;

/**
 * One dot per work (first attempt, % right), oldest → newest; bands under 50 % and from 80 %. Pointing anywhere over the chart (mouse
 * or finger) picks the nearest work, so a phone needs no exact tap; each dot is also a keyboard stop (a link to the work when it has
 * one). The list "Từng bài" right below is the same data as text.
 */
export function FirstTryChart({ points }: { points: ChartPoint[] }) {
  const [on, setOn] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length === 0) return <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="firsttry-chart-empty">{C.chartEmpty}</p>;
  const step = points.length > 1 ? (W - PAD.l - PAD.r) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? PAD.l + i * step : W / 2);
  const low = RESULT_RULES.fixTogetherBelow * 100, high = RESULT_RULES.praiseFrom * 100;
  const cur = on === null ? null : (points[on] ?? null);
  const label = (p: ChartPoint) => C.dotLabel(dm(p.day), p.title, p.pct, p.correct, p.decided);
  // Day labels: every one up to 12 works; else about 8, always the last, never one right before the last (they would touch).
  const every = Math.ceil(points.length / 8);
  const last = points.length - 1;
  const showDay = (i: number) => points.length <= 12 || i === last || (i % every === 0 && last - i >= every / 2);
  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    setOn(points.length > 1 ? Math.max(0, Math.min(last, Math.round((vx - PAD.l) / step))) : 0);
  };
  // Tooltip inside the chart box, kept off the edges.
  const leftPct = cur && on !== null ? Math.min(82, Math.max(18, (x(on) / W) * 100)) : 0;
  const topPct = cur ? (y(cur.pct) / H) * 100 : 0;
  return (
    <figure className="rounded-xl border border-line bg-white p-3" data-testid="firsttry-chart">
      <figcaption className="text-sm font-semibold">{C.chartTitle}</figcaption>
      <p className="text-xs text-muted">{C.chartNote}</p>
      <p className="mt-1 flex flex-wrap gap-4 text-xs" aria-hidden="true">
        <span className="text-[#24613d]"><i className="mr-1 inline-block h-2.5 w-3 rounded-sm bg-[#2f7d4f]/20 align-middle" />{C.bandHigh}</span>
        <span className="text-[#8a3322]"><i className="mr-1 inline-block h-2.5 w-3 rounded-sm bg-[#b4402c]/20 align-middle" />{C.bandLow}</span>
      </p>
      <div className="relative mt-2">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="group" aria-label={C.chartLabel(points.length)}
          onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={(e) => { if (e.pointerType === "mouse") setOn(null); }}>
          <rect x={PAD.l} y={y(low)} width={W - PAD.l - PAD.r} height={y(0) - y(low)} fill="#b4402c" fillOpacity={0.08} />
          <rect x={PAD.l} y={y(100)} width={W - PAD.l - PAD.r} height={y(high) - y(100)} fill="#2f7d4f" fillOpacity={0.08} />
          {[0, low, high, 100].map((v) => (
            <g key={v} aria-hidden="true">
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#d9d6cf" strokeWidth={1} strokeDasharray={v === low || v === high ? "4 3" : undefined} />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b6b66">{v}</text>
            </g>
          ))}
          <polyline aria-hidden="true" fill="none" stroke="#1d4136" strokeWidth={2} points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} />
          {points.map((p, i) => {
            const dot = (
              <>
                <circle cx={x(i)} cy={y(p.pct)} r={14} fill="transparent" />
                <circle cx={x(i)} cy={y(p.pct)} r={on === i ? 7 : 5.5} fill="#1d4136" stroke="#ffffff" strokeWidth={2} />
              </>
            );
            const common = { "data-testid": `chart-dot-${p.instanceId}`, "aria-label": label(p), onFocus: () => setOn(i), onBlur: () => setOn(null) };
            return (
              <g key={p.instanceId}>
                {p.episodeId ? (
                  <a href={`/review/${p.episodeId}`} {...common}>{dot}</a>
                ) : (
                  <g role="img" tabIndex={0} {...common}>{dot}</g>
                )}
                {showDay(i) ? (
                  <text aria-hidden="true" x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="#6b6b66">{dm(p.day)}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {cur ? (
          <p aria-hidden="true" data-testid="chart-tooltip" className="pointer-events-none absolute max-w-[70%] rounded-lg border border-line bg-white px-3 py-1.5 text-xs shadow"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: `translate(-50%, ${topPct < 30 ? "40%" : "-130%"})` }}>
            {label(cur)}
          </p>
        ) : null}
      </div>
      {/* Always mounted, so screen readers hear the work that was picked. */}
      <p className="sr-only" aria-live="polite" data-testid="chart-live">{cur ? label(cur) : ""}</p>
    </figure>
  );
}
