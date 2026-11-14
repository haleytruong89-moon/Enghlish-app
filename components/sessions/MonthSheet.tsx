"use client";
import { useState } from "react";
import { sessionMonthCopy, todayPage } from "@/lib/copy/vi";
import { dayMonth, monthLabel, monthText } from "@/lib/sessions/count";
import type { MonthSummary } from "@/lib/sessions/types";
import { unitsText, weekdayLong } from "@/lib/sessions/view";

/** One month of sessions, to print or to paste into Zalo. No money, no note text; a private note shows only its day. */
export function MonthSheet({ alias, month }: { alias: string; month: MonthSummary }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const text = monthText(alias, month);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setManual(false);
    } catch {
      setManual(true);
    }
  }
  const btn = "inline-flex min-h-11 items-center rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent print:hidden";
  return (
    <section data-testid="month-sheet" className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{sessionMonthCopy.title(alias, monthLabel(month.month))}</h1>
      <p className="text-lg font-semibold" data-testid="month-total">{sessionMonthCopy.total(month.sessions)}</p>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={copy} data-testid="month-copy" className={btn}>
          {copied ? sessionMonthCopy.copied : sessionMonthCopy.copy}
        </button>
        <button type="button" onClick={() => window.print()} data-testid="month-print" className={btn}>
          {sessionMonthCopy.print}
        </button>
      </div>
      {manual ? (
        <div className="flex flex-col gap-1 print:hidden" role="status">
          <p className="text-sm text-muted">{sessionMonthCopy.copyManual}</p>
          <textarea readOnly rows={3} value={text} data-testid="month-manual" onFocus={(e) => e.currentTarget.select()} className="rounded-lg border border-line p-2 text-sm" />
        </div>
      ) : null}
      {month.days.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-5 py-4" data-testid="month-empty">{sessionMonthCopy.empty}</p>
      ) : (
        <table className="w-full text-left text-sm" data-testid="month-sheet-table">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">{sessionMonthCopy.cols.date}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{sessionMonthCopy.cols.weekday}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{sessionMonthCopy.cols.units}</th>
              <th scope="col" className="py-2 font-semibold">{sessionMonthCopy.cols.by}</th>
            </tr>
          </thead>
          <tbody>
            {month.days.map((d) => (
              <tr key={d.date} data-testid={`sheet-row-${d.date}`} className="border-b border-line align-top">
                <td className="py-2 pr-3">{dayMonth(d.date)}</td>
                <td className="py-2 pr-3">{weekdayLong(d.date)}</td>
                <td className="py-2 pr-3">{d.parentOnly ? sessionMonthCopy.parentOnly : d.privateOnly ? sessionMonthCopy.privateNote : unitsText(d.units) || sessionMonthCopy.noUnits}</td>
                <td className="py-2">{d.authors.map((a) => todayPage.roleLabel[a]).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
