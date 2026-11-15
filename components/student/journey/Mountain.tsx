"use client";
import { useState } from "react";
import { journeyCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import type { Journey, JourneyFlag, JourneyNode } from "@/lib/journey/path";
import { MT_H, MT_W, pathBetween, pointAt, SUMMIT_XY, spread, TRAIL } from "@/lib/journey/trail";

type Item =
  | { kind: "unit"; key: string; node: JourneyNode; s: number; xy: readonly [number, number] }
  | { kind: "flag"; key: string; flag: JourneyFlag; s: number; xy: readonly [number, number] };

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

function itemName(it: Item): string {
  return it.kind === "unit" ? it.node.title : it.flag.title;
}
function itemStatus(it: Item): string {
  if (it.kind === "flag") return it.flag.reached ? journeyCopy.flagReached : journeyCopy.remainToFlag(it.flag.remaining);
  const n = it.node;
  const base = n.status === "done" && n.doneOn ? journeyCopy.doneOn(formatDateVi(n.doneOn)) : journeyCopy.unitStatus[n.status];
  return n.climber === "here" ? `${journeyCopy.here} · ${base}` : base;
}

/**
 * "Đường lên đỉnh": a static SVG mountain (no animation). Every dot / flag is a 44 px button with its name and status in words; a tap shows
 * them under the picture. The picture only carries counts of the child's own Units: never a score. Summit unnamed until the tutor confirms one.
 */
export function Mountain({ journey }: { journey: Journey }) {
  const [selected, setSelected] = useState<string | null>(null);
  const seq: { kind: "unit" | "flag"; key: string; node?: JourneyNode; flag?: JourneyFlag }[] = [];
  for (const n of journey.nodes) {
    seq.push({ kind: "unit", key: `u-${n.code}`, node: n });
    for (const f of n.flags) seq.push({ kind: "flag", key: `f-${f.id}`, flag: f });
  }
  const dist = spread(seq.length);
  const items: Item[] = seq.map((s, i) => {
    const d = dist[i] as number;
    return s.kind === "unit"
      ? { kind: "unit", key: s.key, node: s.node as JourneyNode, s: d, xy: pointAt(d) }
      : { kind: "flag", key: s.key, flag: s.flag as JourneyFlag, s: d, xy: pointAt(d) };
  });
  const empty = !journey.hasMain || items.length === 0;
  const climberUnit = journey.climber?.at === "unit" ? items.find((it) => it.kind === "unit" && it.node.code === (journey.climber as { code: string }).code) : undefined;
  const climberXY = climberUnit ? climberUnit.xy : pointAt(0);
  const summitName = journey.summit ? journey.summit.title : journeyCopy.summitUnnamed;
  const hereNode = journey.nodes.find((n) => n.climber === "here") ?? null;
  const aria = empty
    ? journeyCopy.aria.emptyMountain(summitName)
    : journeyCopy.aria.mountain(journey.nodes.filter((n) => n.status !== "skipped").length, journey.nodes.filter((n) => n.status === "done").length, summitName, hereNode?.title ?? null);

  // Solid line only between two neighbouring done Units.
  const solid: string[] = [];
  items.forEach((it, i) => {
    if (it.kind !== "unit" || !it.node.doneToNext) return;
    const next = items.slice(i + 1).find((x) => x.kind === "unit");
    if (next) solid.push(pathBetween(it.s, next.s));
  });
  const nextFlag = items.find((it) => it.kind === "flag" && it.flag.next);
  const sel = items.find((it) => it.key === selected) ?? null;
  const bubble = journey.climber?.at === "foot" ? journeyCopy.atFoot : journey.climber?.at === "unit" ? (journey.climber.kind === "here" ? journeyCopy.here : journeyCopy.justDone) : null;
  const bubbleText = journey.climber?.at === "foot" ? journeyCopy.letsStart : (climberUnit && climberUnit.kind === "unit" ? climberUnit.node.title : null);

  return (
    <div data-testid="mountain">
      <div className="overflow-hidden rounded-2xl border border-line" style={{ background: "#dfeaf0" }}>
        <div className="relative mx-auto w-full max-w-[460px]" style={{ aspectRatio: "400 / 740" }}>
          <svg viewBox={`0 0 ${MT_W} ${MT_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={aria} className="absolute inset-0 block size-full" data-testid="mountain-svg">
            <circle cx="38" cy="56" r="17" fill="#f3d58a" />
            <path d="M-420 740L-420 440L-340 380L-260 420L-170 336L-96 384L-20 330L40 262L78 300L120 250L170 330L200 380L240 320L300 220L340 196L380 240L420 290L476 340L548 296L628 372L706 326L820 404L820 740Z" fill="#b9c9c0" />
            <path d="M200 132L226 156L252 172L276 188L300 234L324 294L344 356L360 420L374 488L384 560L394 640L402 708L414 780L-14 780L-4 708L8 636L20 560L34 484L50 420L64 356L84 294L104 240L130 200L160 164L184 144Z" fill="#7f9a8c" />
            <path d="M200 132L226 156L252 172L276 188L300 234L324 294L344 356L360 420L374 488L384 560L394 640L402 708L414 780L262 780L248 640L236 510L224 380L212 260Z" fill="#6c8a7b" />
            <path d="M200 132L226 156L252 172L264 179L248 187L234 181L220 197L206 187L192 201L178 187L162 194L148 181L160 164L184 144Z" fill="#ffffff" />
            <path d={`M-420 742Q-220 728 -10 746Q60 732 130 742T270 740T410 734Q610 726 820 742L820 780L-420 780Z`} fill="#8fb08a" />
            <path d={pathBetween(0, TRAIL.total)} fill="none" stroke="#e9e2d0" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathBetween(0, TRAIL.total)} fill="none" stroke="#a89f86" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
            {solid.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#2b5d4f" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {items.map((it) => {
              const [x, y] = it.xy;
              if (it.kind === "flag") {
                const reached = it.flag.reached;
                return (
                  <g key={it.key} aria-hidden="true">
                    <line x1={x} y1={y + 1} x2={x} y2={y - 30} stroke="#6b6250" strokeWidth="2.2" strokeLinecap="round" />
                    <path d={`M${x + 1} ${y - 30}L${x + 20} ${y - 24}L${x + 1} ${y - 17}Z`} fill={reached ? "#2b5d4f" : "#d58a1e"} />
                  </g>
                );
              }
              const st = it.node.status;
              if (st === "in_progress") return <circle key={it.key} cx={x} cy={y} r={it.node.climber === "here" ? 9 : 7.5} fill="#fff" stroke="#2b5d4f" strokeWidth="3.4" aria-hidden="true" />;
              if (st === "done") return <circle key={it.key} cx={x} cy={y} r="6.2" fill="#2b5d4f" stroke="#fff" strokeWidth="2.4" aria-hidden="true" />;
              if (st === "skipped") return <circle key={it.key} cx={x} cy={y} r="3.6" fill="#d9dcd3" aria-hidden="true" />;
              return <circle key={it.key} cx={x} cy={y} r="5.6" fill="#fff" stroke="#a89f86" strokeWidth="2.4" aria-hidden="true" />;
            })}
            <line x1="200" y1={SUMMIT_XY[1] + 2} x2="200" y2={SUMMIT_XY[1] - 38} stroke="#6b6250" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" />
            <path d={`M201 ${SUMMIT_XY[1] - 38}L226 ${SUMMIT_XY[1] - 30}L201 ${SUMMIT_XY[1] - 21}Z`} fill="#2b5d4f" aria-hidden="true" />
          </svg>
          {/* labels (decorative: the same words are in the buttons and in the list) */}
          <div aria-hidden="true" className="pointer-events-none absolute whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[13px] font-bold text-white" style={{ left: pct(200, MT_W), top: pct(SUMMIT_XY[1] - 44, MT_H), transform: "translate(-50%, -100%)" }}>
            ▲ {journey.summit ? journey.summit.title : journeyCopy.summitUnnamedShort}
          </div>
          {nextFlag && nextFlag.kind === "flag" ? (
            <div aria-hidden="true" className="pointer-events-none absolute whitespace-nowrap rounded-full border border-[#e3c48a] bg-[#fbf1e4] px-2.5 py-0.5 text-[12.5px] font-bold text-[#7a4a12]" style={{ left: pct(nextFlag.xy[0], MT_W), top: pct(nextFlag.xy[1], MT_H), transform: nextFlag.xy[0] / MT_W < 0.58 ? "translate(24px, -170%)" : "translate(calc(-100% - 6px), -170%)" }}>
              {nextFlag.flag.title}
            </div>
          ) : null}
          {!empty && bubble ? (
            <div aria-hidden="true" className="pointer-events-none absolute max-w-[72%] rounded-xl border-2 border-accent bg-white px-3 py-1.5 text-[13px] font-semibold leading-tight" style={{ left: pct(climberXY[0], MT_W), top: pct(climberXY[1], MT_H), transform: `translate(${climberXY[0] / MT_W < 0.36 ? "-26px" : climberXY[0] / MT_W > 0.64 ? "calc(-100% + 26px)" : "-50%"}, calc(-100% - 50px))` }}>
              <b className="block text-[11.5px] uppercase tracking-wide text-accent">{bubble}</b>
              {bubbleText}
            </div>
          ) : null}
          <div aria-hidden="true" className="pointer-events-none absolute" style={{ left: pct(climberXY[0], MT_W), top: pct(climberXY[1], MT_H), transform: "translate(-50%, calc(-100% + 3px))" }}>
            <svg viewBox="0 0 34 44" width="34" height="44">
              <ellipse cx="17" cy="41" rx="10" ry="2.5" fill="#1c1f1d" opacity=".15" />
              <rect x="5" y="15" width="10" height="15" rx="3.5" fill="#d58a1e" />
              <path d="M15 30L12 40M20 30L23 40" stroke="#1c1f1d" strokeWidth="3" strokeLinecap="round" fill="none" />
              <rect x="10" y="14" width="14" height="18" rx="6" fill="#2b5d4f" />
              <circle cx="17" cy="9" r="6.2" fill="#f1c9a5" />
              <path d="M10.6 8.2a6.4 6.4 0 0 1 12.8 0Z" fill="#1f4339" />
            </svg>
          </div>
          {/* 44 px targets: every Unit and flag has its name and state in words */}
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              aria-expanded={selected === it.key}
              aria-label={`${itemName(it)}. ${itemStatus(it)}`}
              data-testid={it.kind === "unit" ? `mt-unit-${it.node.code}` : `mt-flag-${it.flag.id}`}
              onClick={() => setSelected((cur) => (cur === it.key ? null : it.key))}
              className="absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent p-0"
              style={{ left: pct(it.xy[0], MT_W), top: pct(it.xy[1], MT_H) }}
            />
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite" className="mt-3 min-h-12 text-[15px]" data-testid="mountain-detail">
        {sel ? (
          <p>
            <b>{itemName(sel)}</b> · <span>{itemStatus(sel)}</span>
          </p>
        ) : empty ? (
          <p className="text-muted">{journeyCopy.emptyMountain}</p>
        ) : (
          <p className="text-sm text-muted">{journeyCopy.tapHint}</p>
        )}
      </div>
    </div>
  );
}
