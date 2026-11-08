import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DeskView } from "@/components/desk/DeskView";
import { StaffShell } from "@/components/shell/StaffShell";
import { StudentHome } from "@/components/student/StudentHome";
import { deskCopy, home } from "@/lib/copy/vi";
import { loadDesk } from "@/lib/desk/load";
import { loadHome } from "@/lib/home/loadHome";
import { safeColor } from "@/lib/home/visible";
import { todayVn } from "@/lib/inquiries/dates";
import { revisionsAvailable } from "@/lib/revision/load";
import { firstParam, toShell } from "@/lib/shell/shell";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { loadStudentHome } from "@/lib/work/load";

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

  const anyTest = data.learners.some((l) => l.isTest);

  if (data.kind === "student") {
    const me = data.learners[0];
    const alias = me?.alias ?? data.displayName;
    const color = safeColor(me?.color);
    const work = await loadStudentHome();
    if (work.kind === "login") redirect("/login");
    return (
      <>
        <AppHeader showTestBadge={anyTest} studentNav="next" />
        {work.kind === "ok" ? (
          <StudentHome alias={alias} color={color} data={work.home} review={work.review} feedback={work.feedback} />
        ) : (
          <main className="mx-auto max-w-xl px-5 py-12">
            <h1 className="text-4xl font-bold" style={{ color }}>
              {home.studentGreeting(alias)}
            </h1>
            <p className="mt-4 text-lg">{home.studentEmpty}</p>
          </main>
        )}
      </>
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
  const desk = await loadDesk(shell, learner);
  return (
    <StaffShell shell={shell}>
      <DeskView shell={shell} learner={learner} data={desk} todayIso={todayVn()} />
    </StaffShell>
  );
}
