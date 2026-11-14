"use client";
import { useState } from "react";
import { absenceCopy, sessionBillingCopy, sessionMonthCopy, sessionStatsCopy, todayPage } from "@/lib/copy/vi";
import { dayMonth, monthLabel, monthText } from "@/lib/sessions/count";
import type { MonthSummary } from "@/lib/sessions/types";
import { unitsText, weekdayLong } from "@/lib/sessions/view";

/** One month of sessions, to print or to paste into Zalo. No money, no note text; a private note shows only its day. */
export function MonthSheet({ alias, month, billing = false }: { alias: string; month: MonthSummary; billing?: boolean }) {
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
      {billing ? (
        <ul className="flex flex-col gap-1 text-sm" data-testid="month-billing">
          <li data-testid="month-makeups">{sessionStatsCopy.monthTable.makeups}: {month.billing.makeups}</li>
          <li data-testid="month-absences">{sessionStatsCopy.monthTable.absences}: {sessionBillingCopy.absencesCell(month.billing.absences)}</li>
          <li className="font-semibold" data-testid="month-billable">{sessionStatsCopy.monthTable.billable}: {month.billing.billable}</li>
        </ul>
      ) : null}
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
      {month.days.length === 0 && !(billing && month.billing.absenceTotal > 0) ? (
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
                <td className="py-2 pr-3">
                  {d.parentOnly ? sessionMonthCopy.parentOnly : d.privateOnly ? sessionMonthCopy.privateNote : unitsText(d.units) || sessionMonthCopy.noUnits}
                  {d.makeup ? <span className="text-muted"> ({sessionBillingCopy.makeupDay.toLowerCase()})</span> : null}
                </td>
                <td className="py-2">{d.authors.map((a) => todayPage.roleLabel[a]).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {billing && month.billing.absenceDates.length > 0 ? (
        <div data-testid="month-absence-list" className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{sessionBillingCopy.absenceDays}</h2>
          <ul className="text-sm">
            {month.billing.absenceDates.map((a, i) => (
              <li key={`${a.date}-${i}`}>{dayMonth(a.date)} · {absenceCopy.who[a.requestedBy]}, {a.billable ? absenceCopy.billableYes.toLowerCase() : absenceCopy.billableNo.toLowerCase()}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {billing ? <p className="text-xs text-muted">{sessionBillingCopy.rule}</p> : null}
    </section>
  );
}
