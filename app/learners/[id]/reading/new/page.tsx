import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ReadingReportForm } from "@/components/tutor/ReadingReportForm";
import { learnerWithTrack, readingPage } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadReadingReport, loadReadingTags } from "@/lib/reading/load";
import { monthsBack } from "@/lib/reading/months";
import { READING_MONTHS_BACK } from "@/lib/reading/types";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Enter (or correct) the monthly reading-skill report of one child. Tutor and parent only; ?month=YYYY-MM (default: this month). */
export default async function ReadingNewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  const { month: m } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const thisMonth = todayVn().slice(0, 7);
  const earliest = monthsBack(thisMonth, READING_MONTHS_BACK); // the database accepts the last 24 months only
  const ym = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth && m >= earliest ? m : thisMonth;
  const month = `${ym}-01`;
  const [tags, existing] = await Promise.all([loadReadingTags(learner.trackId), loadReadingReport(learner.id, month)]);

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="reading-page">
        <Link href={`/learners/${learner.id}/weak`} className="inline-flex min-h-11 items-center text-sm text-accent underline">{readingPage.back}</Link>
        <h1 className="mt-2 text-2xl font-bold">{readingPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{readingPage.intro}</p>
        <form method="get" className="mt-4 flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {readingPage.monthLabel}
            <input type="month" name="month" defaultValue={ym} min={earliest} max={thisMonth} className="min-h-11 rounded-lg border border-line px-3" data-testid="reading-month" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm">{readingPage.monthGo}</button>
        </form>
        <ReadingReportForm key={month} learnerId={learner.id} tags={tags} month={month} existing={existing} />
      </main>
    </>
  );
}
