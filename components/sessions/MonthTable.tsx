import Link from "next/link";
import { sessionBillingCopy, sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth, monthLabel } from "@/lib/sessions/count";
import type { MonthSummary } from "@/lib/sessions/types";

/** One row per month, newest first: the number, the days (⚠ where two notes share a day) and a link to the printable sheet. */
export function MonthTable({ learnerId, months, billing = false }: { learnerId: string; months: MonthSummary[]; billing?: boolean }) {
  return (
    <div className="overflow-x-auto" data-testid="month-table">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{sessionStatsCopy.monthTable.title}</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.month}</th>
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.count}</th>
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.dates}</th>
            {billing ? (
              <>
                <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.makeups}</th>
                <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.absences}</th>
                <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.billable}</th>
              </>
            ) : null}
            <th scope="col" className="py-2 font-semibold"><span className="sr-only">{sessionStatsCopy.monthTable.open}</span></th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} data-testid={`month-row-${m.month}`} className="border-b border-line align-top">
              <th scope="row" className="py-2 pr-3 font-medium">{monthLabel(m.month)}</th>
              <td className="py-2 pr-3">{m.sessions}</td>
              <td className="py-2 pr-3">
                {m.days.map((d, i) => (
                  <span key={d.date}>
                    {i > 0 ? ", " : ""}
                    {dayMonth(d.date)}
                    {d.sameDay ? <span title={sessionStatsCopy.sameDay} aria-label={sessionStatsCopy.sameDay}>{sessionStatsCopy.sameDayMark}</span> : null}
                    {d.makeup ? <span className="text-muted"> ({sessionBillingCopy.makeupDay.toLowerCase()})</span> : null}
                    {billing && m.billing.clashDates.includes(d.date) ? <span title={sessionBillingCopy.clash} aria-label={sessionBillingCopy.clash} data-testid={`clash-${d.date}`}>{sessionBillingCopy.clashMark}</span> : null}
                    {d.parentOnly ? <span className="text-muted" data-testid={`parent-only-${d.date}`}> ({sessionStatsCopy.parentOnly})</span> : null}
                  </span>
                ))}
              </td>
              {billing ? (
                <>
                  <td className="py-2 pr-3" data-testid={`month-makeups-${m.month}`}>{m.billing.makeups}</td>
                  <td className="py-2 pr-3" data-testid={`month-absences-${m.month}`}>{sessionBillingCopy.absencesCell(m.billing.absences)}</td>
                  <td className="py-2 pr-3 font-semibold" data-testid={`month-billable-${m.month}`}>{m.billing.billable}</td>
                </>
              ) : null}
              <td className="py-2 text-right">
                <Link href={`/learners/${learnerId}/notes/month/${m.month}`} data-testid={`month-open-${m.month}`} className="inline-flex min-h-11 items-center text-accent underline">
                  {sessionStatsCopy.monthTable.open}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
