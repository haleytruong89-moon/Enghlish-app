"use client";
import { useState } from "react";
import { sessionBillingCopy, sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth } from "@/lib/sessions/count";
import type { WeekRow } from "@/lib/sessions/types";
import { absenceLine, longDay, unitsText } from "@/lib/sessions/view";

/** 12 weeks x 7 days. A day with a session has a dot AND a darker cell (not colour alone); touching it writes the day below. */
export function WeekGrid({ rows }: { rows: WeekRow[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const all = rows.flatMap((r) => r.cells);
  const pickCell = all.find((c) => c.date === picked) ?? null;
  const pick = pickCell?.day ?? null;
  const pickAbsence = pickCell?.absence ?? null;
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
              if (!c.day && !c.absence) {
                return (
                  <div key={c.date} role="gridcell" aria-label={c.future ? sessionStatsCopy.cellFuture(label) : sessionStatsCopy.cellNone(label)} aria-disabled={c.future ? "true" : undefined}
                    className={`flex min-h-9 items-center justify-center rounded-md border border-line text-xs ${c.future ? "opacity-40" : ""}`}>
                    <span aria-hidden="true" className="text-muted">{Number(c.date.slice(8, 10))}</span>
                  </div>
                );
              }
              const units = c.day ? unitsText(c.day.units) : "";
              const aria = [
                c.day ? (c.day.parentOnly ? sessionStatsCopy.cellParent(label) : sessionStatsCopy.cellHas(label, [units, c.day.makeup ? sessionBillingCopy.makeupDay.toLowerCase() : ""].filter(Boolean).join(" · "))) : null,
                c.absence ? sessionBillingCopy.cellAbsence(label, sessionBillingCopy.partyShort[c.absence.requestedBy], c.absence.billable) : null,
                c.clash ? sessionBillingCopy.cellClash(label) : null,
              ].filter(Boolean).join(" · ");
              const counted = !!c.day && !c.day.parentOnly;
              return (
                <button key={c.date} type="button" role="gridcell" data-testid={`cell-${c.date}`} aria-label={aria} aria-selected={picked === c.date}
                  onClick={() => setPicked(c.date)}
                  className={counted ? "flex min-h-9 items-center justify-center gap-0.5 rounded-md border border-accent bg-[#d3e6df] text-xs font-semibold text-[#1d4136]" : "flex min-h-9 items-center justify-center gap-0.5 rounded-md border border-dashed border-muted bg-white text-xs text-muted"}>
                  <span aria-hidden="true">{Number(c.date.slice(8, 10))}</span>
                  <span aria-hidden="true">{c.day ? (c.day.parentOnly ? "○" : "●") : ""}</span>
                  {c.day?.makeup ? <span aria-hidden="true" data-testid={`cell-makeup-${c.date}`}>{sessionBillingCopy.makeupMark}</span> : null}
                  {c.absence ? <span aria-hidden="true" data-testid={`cell-absence-${c.date}`}>{sessionBillingCopy.absenceMark}</span> : null}
                  {c.clash ? <span aria-hidden="true" data-testid={`cell-clash-${c.date}`}>{sessionBillingCopy.clashMark}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p aria-live="polite" data-testid="week-detail" className="min-h-6 text-sm">
        {picked && (pick || pickAbsence)
          ? [
              longDay(picked),
              pick ? (pick.parentOnly ? sessionStatsCopy.parentOnly : unitsText(pick.units)) : "",
              pick?.makeup ? sessionBillingCopy.makeupDay : "",
              pick?.sameDay ? sessionStatsCopy.sameDay : "",
              pickCell?.clash ? sessionBillingCopy.clash : "",
              pickAbsence ? `${sessionBillingCopy.absenceDays}: ${absenceLine({ absentOn: picked, ...pickAbsence })}` : "",
            ].filter(Boolean).join(" · ")
          : <span className="text-muted">{sessionStatsCopy.detailHint}</span>}
      </p>
    </div>
  );
}
