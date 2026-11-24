import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { LookupForm } from "@/components/student/tutor/LookupForm";
import { TUTOR_NOTICE_VERSION } from "@/lib/ai/config";
import { tutorPageCopy as c } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { loadTutorPage } from "@/lib/student/notebook";

export const dynamic = "force-dynamic";

/** "Gia sư" (E2a): the one place where the child asks the AI tutor, outside every work (D-G1, D-G2). Before migration 0041: 404. */
export default async function TutorPage() {
  const [base, page] = await Promise.all([loadDeskBase(), loadTutorPage()]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok" || !page) notFound();
  const off = !page.status.aiEnabled || page.status.consentVersion !== TUTOR_NOTICE_VERSION;
  const left = Math.max(0, page.status.lookupLimit - page.status.lookupsToday);
  return (
    <StudentDeskShell active="tutor" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest} tutorReady={base.tutorReady}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5 lg:flex-row" data-testid="tutor-page">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold">{c.title}</h1>
            <p className="mt-1 text-muted">{c.intro}</p>
            <p className="mt-1 text-sm text-muted" data-testid="tutor-watched">{c.watched}</p>
          </div>
          <LookupForm off={off} />
        </section>
        <aside className="flex flex-col gap-3 lg:w-64 lg:shrink-0" aria-labelledby="recent-title">
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="recent-lookups">
            <h2 id="recent-title" className="font-bold">{c.recent}</h2>
            {page.recent.length ? (
              <ul className="flex flex-wrap gap-2 lg:flex-col">
                {page.recent.map((r) => (
                  <li key={r.cardId}>
                    <Link href={`/tutor/card/${r.cardId}`} lang="en" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 no-underline lg:rounded-xl">
                      {r.headword}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{c.recentEmpty}</p>
            )}
            <p className="text-sm text-muted">
              {c.left(left).split(String(left))[0]}<span data-count="work">{left}</span>{c.left(left).split(String(left))[1]}
            </p>
          </div>
        </aside>
      </div>
    </StudentDeskShell>
  );
}
