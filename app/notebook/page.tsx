import { notFound, redirect } from "next/navigation";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { NotebookList } from "@/components/student/notebook/NotebookList";
import { notebookCopy as c } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { loadNotebook } from "@/lib/student/notebook";

export const dynamic = "force-dynamic";

/** "Sổ tay" (E2a, D-G4): its own section of the desk; tab "Từ vựng" now, "Ngữ pháp" with E3. Before migration 0041: 404. */
export default async function NotebookPage() {
  const [base, rows] = await Promise.all([loadDeskBase(), loadNotebook()]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok" || rows === null) notFound();
  return (
    <StudentDeskShell active="notebook" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest} tutorReady={base.tutorReady}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="notebook-page">
        <div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <p className="mt-1 text-muted">{c.intro}</p>
        </div>
        <span className="self-start rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">{c.tabWords}</span>
        <NotebookList rows={rows} />
      </div>
    </StudentDeskShell>
  );
}
