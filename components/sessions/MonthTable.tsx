import Link from "next/link";
import { sessionStatsCopy } from "@/lib/copy/vi";
import { dayMonth, monthLabel } from "@/lib/sessions/count";
import type { MonthSummary } from "@/lib/sessions/types";

/** One row per month, newest first: the number, the days (⚠ where two notes share a day) and a link to the printable sheet. */
export function MonthTable({ learnerId, months }: { learnerId: string; months: MonthSummary[] }) {
  return (
    <div className="overflow-x-auto" data-testid="month-table">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{sessionStatsCopy.monthTable.title}</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.month}</th>
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.count}</th>
            <th scope="col" className="py-2 pr-3 font-semibold">{sessionStatsCopy.monthTable.dates}</th>
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
                    {d.sameDay ? <span title={sessionStatsCopy.sameDay} aria-label={sessionStatsCopy.sameDay}> ⚠</span> : null}
                  </span>
                ))}
              </td>
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
