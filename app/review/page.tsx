import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { activityLabels, fallbackLabels, modeLabels, provenanceLabels, reviewPage, revisionReviewCopy, type Mode } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { formatWhen } from "@/lib/review/format";
import { cursorToParam, FILTERS, parseCursor, parseFilter } from "@/lib/review/inbox";
import { loadInbox } from "@/lib/review/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Inbox of submitted work — parent and tutor only (students and outsiders get a plain 404). */
export default async function ReviewInboxPage({ searchParams }: { searchParams: Promise<{ f?: string | string[]; after?: string | string[] }> }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const sp = await searchParams;
  const filter = parseFilter(sp.f);
  const after = parseCursor(sp.after);
  // The database filters, orders (oldest first) and pages; the counts on the filter chips come from it too.
  const { items, next, counts } = await loadInbox(filter, after);
  const anyTest = items.some((i) => i.isTest);
  const base = filter === "todo" ? "/review" : `/review?f=${filter}`;

  return (
    <>
      <AppHeader name={access.member.displayName} showTestBadge={anyTest} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{reviewPage.inboxTitle}</h1>
        <p className="mt-1 text-sm text-muted">{reviewPage.inboxIntro}</p>

        <nav aria-label={reviewPage.filtersLabel} className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "todo" ? "/review" : `/review?f=${f}`}
              aria-current={f === filter ? "true" : undefined}
              data-testid={`filter-${f}`}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${
                f === filter ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white hover:border-accent"
              }`}
            >
              <span>{reviewPage.filters[f]}</span>
              <span>{counts[f]}</span>
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="inbox-empty">
            {filter === "done" ? reviewPage.inboxEmptyDone : reviewPage.inboxEmpty}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3" data-testid="inbox-list">
            {items.map((i) => (
              <li key={i.episodeId} className="rounded-xl border border-line bg-white px-5 py-4" data-testid={`inbox-item-${i.episodeId}`}>
                <p className="text-xs font-bold text-an">{reviewPage.stepOf(i.alias, i.stepNo)}</p>
                <p className="mt-1 font-semibold">
                  {i.titleVi} · {activityLabels[i.activityType] ?? fallbackLabels.activity}
                  {i.revisionRound ? (
                    <span className="ml-2 rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs text-[#6B4600]" data-testid="inbox-revision">
                      {revisionReviewCopy.inboxLabel(i.revisionRound)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {reviewPage.submittedAt(formatWhen(i.submittedAt))} · {reviewPage.attemptNo(i.attemptNo)} ·{" "}
                  {modeLabels[i.mode as Mode]?.staff ?? fallbackLabels.mode}
                </p>
                <p className="mt-1 text-sm text-muted">{provenanceLabels[i.provenance] ?? fallbackLabels.provenance}</p>
                <p className="mt-2 text-sm">
                  {i.revisionRound ? (
                    <span data-testid="revision-progress">{revisionReviewCopy.inboxProgress}</span>
                  ) : (
                    <span data-testid="progress">{reviewPage.progress(i.targetsDecided, i.targetsTotal)}</span>
                  )}
                  {!i.canDecide ? (
                    <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs" data-testid="waiting-tutor">
                      {reviewPage.waitingTutor}
                    </span>
                  ) : null}
                </p>
                <Link
                  href={`/review/${i.episodeId}`}
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-white"
                >
                  {reviewPage.open}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {after || next ? (
          <nav aria-label={reviewPage.pagesLabel} className="mt-6 flex flex-wrap items-center gap-3">
            {after ? (
              <Link href={base} data-testid="inbox-first-page" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm hover:border-accent">
                {reviewPage.firstPage}
              </Link>
            ) : null}
            {next ? (
              <Link
                href={`${base}${filter === "todo" ? "?" : "&"}after=${encodeURIComponent(cursorToParam(next))}`}
                data-testid="inbox-next-page"
                className="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-white"
              >
                {reviewPage.nextPage}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
    </>
  );
}
