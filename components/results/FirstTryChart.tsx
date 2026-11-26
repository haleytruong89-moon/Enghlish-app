"use client";
import { useState } from "react";
import { resultsCopy } from "@/lib/copy/vi";
import { RESULT_RULES } from "@/lib/results/actions";
import type { ChartPoint } from "@/lib/results/overview";

const W = 640, H = 220, PAD = { l: 34, r: 22, t: 12, b: 28 };
const y = (p: number) => PAD.t + ((100 - p) / 100) * (H - PAD.t - PAD.b);
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const C = resultsCopy.overview;

/** One dot per work (first attempt, % right), oldest → newest; bands under 50 % and from 80 %. Hover / focus shows the work. */
export function FirstTryChart({ points }: { points: ChartPoint[] }) {
  const [on, setOn] = useState<string | null>(null);
  if (points.length === 0) return <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="firsttry-chart-empty">{C.chartEmpty}</p>;
  const step = points.length > 1 ? (W - PAD.l - PAD.r) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? PAD.l + i * step : W / 2);
  const low = RESULT_RULES.fixTogetherBelow * 100, high = RESULT_RULES.praiseFrom * 100;
  const cur = points.find((p) => p.instanceId === on) ?? null;
  // Day labels: every one up to 12 works; else about 8, always the last, never one right before the last (they would touch).
  const every = Math.ceil(points.length / 8);
  const last = points.length - 1;
  const showDay = (i: number) => points.length <= 12 || i === last || (i % every === 0 && last - i >= every / 2);
  const ci = cur ? points.indexOf(cur) : -1;
  return (
    <figure className="relative rounded-xl border border-line bg-white p-3" data-testid="firsttry-chart">
      <figcaption className="text-sm font-semibold">{C.chartTitle}</figcaption>
      <p className="text-xs text-muted">{C.chartNote}</p>
      <p className="mt-1 flex flex-wrap gap-4 text-xs" aria-hidden="true">
        <span className="text-[#24613d]"><i className="mr-1 inline-block h-2.5 w-3 rounded-sm bg-[#2f7d4f]/20 align-middle" />{C.bandHigh}</span>
        <span className="text-[#8a3322]"><i className="mr-1 inline-block h-2.5 w-3 rounded-sm bg-[#b4402c]/20 align-middle" />{C.bandLow}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={C.chartLabel(points.length)}>
        <rect x={PAD.l} y={y(low)} width={W - PAD.l - PAD.r} height={y(0) - y(low)} fill="#b4402c" fillOpacity={0.08} />
        <rect x={PAD.l} y={y(100)} width={W - PAD.l - PAD.r} height={y(high) - y(100)} fill="#2f7d4f" fillOpacity={0.08} />
        {[0, low, high, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#d9d6cf" strokeWidth={1} strokeDasharray={v === low || v === high ? "4 3" : undefined} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b6b66">{v}</text>
          </g>
        ))}
        <polyline fill="none" stroke="#1d4136" strokeWidth={2} points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} />
        {points.map((p, i) => (
          <g key={p.instanceId}>
            <circle cx={x(i)} cy={y(p.pct)} r={14} fill="transparent" tabIndex={0} role="button" data-testid={`chart-dot-${p.instanceId}`}
              aria-label={C.dotLabel(dm(p.day), p.title, p.pct, p.correct, p.decided)}
              onMouseEnter={() => setOn(p.instanceId)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(p.instanceId)} onBlur={() => setOn(null)} />
            <circle cx={x(i)} cy={y(p.pct)} r={on === p.instanceId ? 6 : 4.5} fill="#1d4136" stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
            {showDay(i) ? (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b6b66">{dm(p.day)}</text>
            ) : null}
          </g>
        ))}
      </svg>
      {cur ? (
        <p role="status" data-testid="chart-tooltip" className="pointer-events-none absolute rounded-lg border border-line bg-white px-3 py-1.5 text-xs shadow"
          style={{ left: `${(x(ci) / W) * 100}%`, top: `${(y(cur.pct) / H) * 100}%`, transform: "translate(-50%, -130%)" }}>
          {C.dotLabel(dm(cur.day), cur.title, cur.pct, cur.correct, cur.decided)}
        </p>
      ) : null}
    </figure>
  );
}
