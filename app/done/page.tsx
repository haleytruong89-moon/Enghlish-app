import { notFound, redirect } from "next/navigation";
import { HistoryList } from "@/components/student/desk/HistoryList";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { firstParam } from "@/lib/shell/shell";
import { DESK_PAGE, loadDeskBase, loadHistory } from "@/lib/student/desk";

export const dynamic = "force-dynamic";

/** "Đã làm" (W4b): everything the child sent, waiting or seen. Staff and a real child on a preview get a plain 404. */
export default async function DonePage({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const raw = firstParam((await searchParams).before);
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const [base, rows] = await Promise.all([loadDeskBase(), loadHistory(before)]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok") notFound();
  const last = rows?.at(-1);
  const olderHref = rows && rows.length >= DESK_PAGE.done && last ? `/done?before=${encodeURIComponent(last.submittedAt)}` : null;
  return (
    <StudentDeskShell active="done" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.seenAt)} showTestBadge={base.isTest}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="done-page">
        <div>
          <h1 className="text-3xl font-bold">{c.doneTitle}</h1>
          <p className="mt-1 text-muted">{c.doneIntro}</p>
        </div>
        {rows ? <HistoryList rows={rows} olderHref={olderHref} /> : <p className="rounded-2xl border border-line bg-white p-4" data-testid="desk-unavailable">{c.unavailable}</p>}
      </div>
    </StudentDeskShell>
  );
}
