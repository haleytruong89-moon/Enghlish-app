import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DeskView } from "@/components/desk/DeskView";
import { StaffShell } from "@/components/shell/StaffShell";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { TodayView } from "@/components/student/desk/TodayView";
import { deskCopy, home, studentDeskCopy } from "@/lib/copy/vi";
import { loadDesk } from "@/lib/desk/load";
import { loadHome } from "@/lib/home/loadHome";
import { todayVn } from "@/lib/inquiries/dates";
import { revisionsAvailable } from "@/lib/revision/load";
import { loadDeskBase, loadToday } from "@/lib/student/desk";
import { loadMyWeekView } from "@/lib/student/weekLoad";
import { firstParam, toShell } from "@/lib/shell/shell";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
  const data = await loadHome();
  if (data.kind === "signed-out") redirect("/login");

  if (data.kind === "no-member") {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-xl px-4 py-12">
          <h1 className="text-2xl font-bold">{home.noAccessTitle}</h1>
          <p className="mt-3 text-muted">{home.noAccessBody}</p>
        </main>
      </>
    );
  }

  if (data.kind === "student") {
    // W4b: the child's desk (Hôm nay). Reads through the user client and the eng_my_* functions.
    const [base, today, week] = await Promise.all([loadDeskBase(), loadToday(), loadMyWeekView()]);
    if (base.kind === "login" || today.kind === "login") redirect("/login");
    if (base.kind !== "ok" || today.kind !== "ok") notFound();
    return (
      <StudentDeskShell active="today" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest}>
        {today.tasks ? (
          <TodayView alias={base.alias} color={base.color} tasks={today.tasks} practice={today.practice} review={today.review} week={week?.view ?? null} />
        ) : (
          <div className="mx-auto max-w-xl py-8">
            <h1 className="text-3xl font-bold" style={{ color: base.color }}>{studentDeskCopy.greeting(base.alias)}</h1>
            <p className="mt-4 text-lg" data-testid="desk-unavailable">{studentDeskCopy.unavailable}</p>
          </div>
        )}
      </StudentDeskShell>
    );
  }

  // Staff (tutor / parent): Bàn làm việc of one child (plan K9), in the workdesk shell.
  const shell = toShell(data, firstParam((await searchParams).learner), await revisionsAvailable());
  if (!shell) redirect("/login"); // unreachable: students returned above
  const learner = shell.current;
  if (!learner) {
    return (
      <StaffShell shell={shell}>
        <div data-testid="today-page">
          <h1 className="text-2xl font-bold" data-testid="desk-title">{deskCopy.titleEmpty}</h1>
          <p className="mt-3 text-muted">{shell.role === "parent" ? home.parentSummary(0) : home.tutorEmpty}</p>
        </div>
      </StaffShell>
    );
  }
  // The child comes from the RLS-scoped list; the gate runs anyway before the admin-client loaders of the desk.
  await requireLearnerPage(learner.id, "tutorwork:read");
  await requireLearnerPage(learner.id, "goals:read"); // the goal box and the goal row of Chờ duyệt read eng_week_facts with the admin client
  const desk = await loadDesk(shell, learner);
  return (
    <StaffShell shell={shell}>
      <DeskView shell={shell} learner={learner} data={desk} todayIso={todayVn()} />
    </StaffShell>
  );
}
