import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MonthSheet } from "@/components/sessions/MonthSheet";
import { getAuthUser } from "@/lib/auth/session";
import { sessionMonthCopy } from "@/lib/copy/vi";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { todayVn } from "@/lib/inquiries/dates";
import { authorizeLearnerPage } from "@/lib/review/access";
import { monthBilling, months, sessionDays } from "@/lib/sessions/count";
import { loadSessionFacts } from "@/lib/sessions/load";
import { parseMonth, unitTitleOf } from "@/lib/sessions/view";

export const dynamic = "force-dynamic";

/** One month of sessions to print or copy (tutor or parent of the child; students and outsiders: 404). No AI, no money. */
export default async function SessionMonthPage({ params }: { params: Promise<{ id: string; month: string }> }) {
  const { id, month } = await params;
  const access = await authorizeLearnerPage(await getAuthUser(), id, "notes:read");
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  const today = todayVn();
  const m = parseMonth(month, today);
  if (!m) notFound();
  const { learner } = access.grant;
  const [facts, cards] = await Promise.all([loadSessionFacts(learner.id).catch(() => null), loadCurriculumCards(learner.id).catch(() => [])]);
  if (!facts) notFound();
  const days = sessionDays(facts.notes, facts.taught, unitTitleOf(cards), facts.marks);
  const summary = months(days, today, facts.absences).find((x) => x.month === m) ?? { month: m, sessions: 0, days: [], billing: monthBilling(m, [], facts.absences) };
  return (
    <div className="mx-auto max-w-3xl" data-testid="month-page">
      <Link href={`/learners/${learner.id}/notes`} className="inline-flex min-h-11 items-center text-sm text-accent underline print:hidden">
        {sessionMonthCopy.back}
      </Link>
      <MonthSheet alias={learner.alias} month={summary} billing={facts.billing} />
    </div>
  );
}
