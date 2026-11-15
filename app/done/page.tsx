import { notFound, redirect } from "next/navigation";
import { HistoryList } from "@/components/student/desk/HistoryList";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { firstParam } from "@/lib/shell/shell";
import { DESK_PAGE, loadDeskBase, loadHistory, parseCursor } from "@/lib/student/desk";

export const dynamic = "force-dynamic";

/** "Đã làm" (W4b): everything the child sent, waiting or seen. Staff and a real child on a preview get a plain 404. */
export default async function DonePage({ searchParams }: { searchParams: Promise<{ before?: string | string[]; ref?: string | string[] }> }) {
  const sp = await searchParams;
  const cursor = parseCursor(firstParam(sp.before), firstParam(sp.ref));
  const [base, page] = await Promise.all([loadDeskBase(), loadHistory(cursor)]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok") notFound();
  const last = page?.rows.at(-1);
  const olderHref = page && page.rows.length >= DESK_PAGE.done && last ? `/done?before=${encodeURIComponent(last.submittedAt)}&ref=${last.ref}` : null;
  return (
    <StudentDeskShell active="done" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.seenAt)} showTestBadge={base.isTest}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="done-page">
        <div>
          <h1 className="text-3xl font-bold">{c.doneTitle}</h1>
          <p className="mt-1 text-muted">{c.doneIntro}</p>
        </div>
        {page ? <HistoryList rows={page.rows} total={page.total} waiting={page.waiting} olderHref={olderHref} /> : <p className="rounded-2xl border border-line bg-white p-4" data-testid="desk-unavailable">{c.unavailable}</p>}
      </div>
    </StudentDeskShell>
  );
}
