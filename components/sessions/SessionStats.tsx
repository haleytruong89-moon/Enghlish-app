import { sessionBillingCopy, sessionStatsCopy } from "@/lib/copy/vi";
import type { AbsenceRow } from "@/lib/sessions/types";
import { AbsenceForm } from "./AbsenceForm";
import { addDays } from "@/lib/inquiries/dates";
import { months as monthsOf, stats as statsOf, weekGrid } from "@/lib/sessions/count";
import type { SessionDay } from "@/lib/sessions/types";
import { currentUnitLines, perWeekText } from "@/lib/sessions/view";
import { MonthTable } from "./MonthTable";
import { WeekGrid } from "./WeekGrid";

type Cards = Parameters<typeof currentUnitLines>[0];

const card = "flex flex-col gap-1 rounded-2xl border border-line bg-white p-4";

/** "Tổng quan buổi học": four number cards, the 12-week calendar and the monthly table. The same for tutor and parent (U9). */
export function SessionStats({ learnerId, days, today, cards, absences = [], billing = false }: { learnerId: string; days: SessionDay[]; today: string; cards: Cards; absences?: AbsenceRow[]; billing?: boolean }) {
  const s = statsOf(days, today);
  const unit = currentUnitLines(cards);
  return (
    <section aria-labelledby="session-stats-title" data-testid="session-stats" className="mt-6 flex flex-col gap-4">
      <h2 id="session-stats-title" className="text-lg font-semibold">{sessionStatsCopy.title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={card} data-testid="stat-total">
          <span className="text-xs text-muted">{sessionStatsCopy.cards.total}</span>
          <span className="text-2xl font-bold">{s.total}</span>
        </div>
        <div className={card} data-testid="stat-month">
          <span className="text-xs text-muted">{sessionStatsCopy.cards.thisMonth}</span>
          <span className="text-2xl font-bold">{s.thisMonth}</span>
        </div>
        <div className={card} data-testid="stat-per-week">
          <span className="text-xs text-muted">{sessionStatsCopy.cards.perWeek}</span>
          <span className="text-2xl font-bold">{perWeekText(s.perWeek)}</span>
          <span className="text-xs text-muted">{sessionStatsCopy.perWeekHint}</span>
        </div>
        <div className={card} data-testid="stat-unit">
          <span className="text-xs text-muted">{sessionStatsCopy.cards.unit}</span>
          {unit.lines.length === 0 ? (
            <span className="text-sm font-semibold">{sessionStatsCopy.unitNone}</span>
          ) : (
            <>
              {unit.lines.map((l) => (
                <span key={l} className="text-sm font-semibold">{l}</span>
              ))}
              {unit.more > 0 ? <span className="text-xs text-muted">{sessionStatsCopy.unitMore(unit.more)}</span> : null}
            </>
          )}
        </div>
      </div>
      {days.length === 0 && (!billing || absences.length === 0) ? (
        <p className="rounded-xl border border-line bg-white px-5 py-4" data-testid="sessions-none">{sessionStatsCopy.none}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
            <h3 className="text-sm font-semibold">{sessionStatsCopy.calendarTitle}</h3>
            <WeekGrid rows={weekGrid(days, today, 12, absences)} />
          </div>
          <div className="rounded-2xl border border-line bg-white p-4">
            <h3 className="text-sm font-semibold">{sessionStatsCopy.monthTable.title}</h3>
            <MonthTable learnerId={learnerId} months={monthsOf(days, today, absences)} billing={billing} />
          </div>
        </>
      )}
      {billing ? (
        <AbsenceForm learnerId={learnerId} absences={absences} today={today} minDate={addDays(today, -120)} maxDate={addDays(today, 60)} />
      ) : (
        <p className="rounded-xl border border-line bg-white px-5 py-4 text-sm text-muted" data-testid="billing-unavailable">{sessionBillingCopy.unavailable}</p>
      )}
      <p className="text-xs text-muted" data-testid="sessions-rule">{sessionStatsCopy.rule}</p>
      {billing ? <p className="text-xs text-muted" data-testid="billing-rule">{sessionBillingCopy.rule}</p> : null}
    </section>
  );
}
