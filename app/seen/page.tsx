import { notFound, redirect } from "next/navigation";
import { SeenList } from "@/components/student/desk/SeenList";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { ReviewByDomain } from "@/components/student/ReviewByDomain";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { DESK_PAGE, loadDeskBase, loadReviewByDomain, loadReviewPoints, loadSeen } from "@/lib/student/desk";
import { firstParam } from "@/lib/shell/shell";

export const dynamic = "force-dynamic";

/** "Đã xem" (W4b): what the adults looked at, with the words they sent. Staff and a real child on a preview (ALLOW_REAL_LEARNERS=false) get a plain 404. */
export default async function SeenPage({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const raw = firstParam((await searchParams).before);
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const [base, domains, review] = await Promise.all([loadDeskBase(), loadReviewByDomain(), loadReviewPoints()]);
  if (base.kind === "login") redirect("/login");
  if (base.kind !== "ok") notFound();
  const rows = before === null ? base.seenFirst : await loadSeen(before); // the first page was already read for the tab badge
  const last = rows?.at(-1);
  const olderHref = rows && rows.length >= DESK_PAGE.seen && last ? `/seen?before=${encodeURIComponent(last.seenAt)}` : null;
  return (
    <StudentDeskShell active="seen" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.seenAt)} showTestBadge={base.isTest}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="seen-page">
        <div>
          <h1 className="text-3xl font-bold">{c.seenTitle}</h1>
          <p className="mt-1 text-muted">{c.seenIntro}</p>
        </div>
        {before === null && review && review.labels.length > 0 ? (
          <section aria-labelledby="review-labels-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="review-labels">
            <h2 id="review-labels-title" className="text-[15px] font-bold">{c.noteReview}</h2>
            <ul className="flex flex-wrap gap-2">
              {review.labels.map((l) => (
                <li key={l} className="rounded-xl bg-[#f6e9df] px-3 py-1.5 text-sm text-[#5a2a0c]">{l}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {before === null && domains && domains.length > 0 ? <ReviewByDomain items={domains} /> : null}
        {rows ? (
          <SeenList rows={rows} learnerId={base.learnerId} olderHref={olderHref} />
        ) : (
          <p className="rounded-2xl border border-line bg-white p-4" data-testid="desk-unavailable">{c.unavailable}</p>
        )}
      </div>
    </StudentDeskShell>
  );
}
