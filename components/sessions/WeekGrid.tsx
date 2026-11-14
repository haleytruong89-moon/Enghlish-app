"use client";
import { useState } from "react";
import { sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth } from "@/lib/sessions/count";
import type { WeekRow } from "@/lib/sessions/types";
import { longDay, unitsText } from "@/lib/sessions/view";

/** 12 weeks x 7 days. A day with a session has a dot AND a darker cell (not colour alone); touching it writes the day below. */
export function WeekGrid({ rows }: { rows: WeekRow[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const all = rows.flatMap((r) => r.cells);
  const pick = all.find((c) => c.date === picked)?.day ?? null;
  return (
    <div data-testid="week-grid-box" className="flex flex-col gap-2">
      <div role="grid" aria-label={sessionStatsCopy.calendarTitle} data-testid="week-grid" className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-1 text-sm">
        <div role="row" className="contents">
          <span />
          {sessionStatsCopy.weekdays.map((w) => (
            <span key={w} role="columnheader" className="text-center text-xs font-semibold text-muted">
              {w}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.weekStart} role="row" className="contents">
            <span role="rowheader" className="self-center text-xs text-muted">
              {dayMonth(r.weekStart)}
            </span>
            {r.cells.map((c) => {
              const label = longDay(c.date);
              if (!c.day) {
                return (
                  <div key={c.date} role="gridcell" aria-label={c.future ? sessionStatsCopy.cellFuture(label) : sessionStatsCopy.cellNone(label)} aria-disabled={c.future ? "true" : undefined}
                    className={`flex min-h-9 items-center justify-center rounded-md border border-line text-xs ${c.future ? "opacity-40" : ""}`}>
                    <span aria-hidden="true" className="text-muted">{Number(c.date.slice(8, 10))}</span>
                  </div>
                );
              }
              const units = unitsText(c.day.units);
              return (
                <button key={c.date} type="button" role="gridcell" data-testid={`cell-${c.date}`} aria-label={sessionStatsCopy.cellHas(label, units)} aria-selected={picked === c.date}
                  onClick={() => setPicked(c.date)}
                  className="flex min-h-9 items-center justify-center gap-0.5 rounded-md border border-accent bg-[#d3e6df] text-xs font-semibold text-[#1d4136]">
                  <span aria-hidden="true">{Number(c.date.slice(8, 10))}</span>
                  <span aria-hidden="true">●</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p aria-live="polite" data-testid="week-detail" className="min-h-6 text-sm">
        {pick && picked
          ? `${longDay(picked)} · ${unitsText(pick.units) || ""}${pick.sameDay ? ` ${sessionStatsCopy.sameDay}` : ""}`.replace(/ · $/, "")
          : <span className="text-muted">{sessionStatsCopy.detailHint}</span>}
      </p>
    </div>
  );
}
