import Link from "next/link";
import { notFound } from "next/navigation";
import { TutorAsksList } from "@/components/tutor/TutorAsksList";
import { tutorAsksCopy as c } from "@/lib/copy/vi";
import { loadTutorAsks, TUTOR_ASKS_PAGE } from "@/lib/notebook/adultLoad";
import { deskHref } from "@/lib/shell/paths";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Con hỏi Gia sư" (E2a, D-G8): the parent and the child's tutor read every ask; no AI here. `?before=` pages older rows. */
export default async function TutorAsksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { learner } = await requireLearnerPage(id, "tutorwork:read");
  const before = sp.before && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(sp.before) ? sp.before : null;
  const rows = await loadTutorAsks(learner.id, before);
  if (rows === "forbidden") notFound();
  const last = rows?.at(-1);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3" data-testid="tutor-asks-page">
      <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center self-start text-sm text-accent underline">{c.back}</Link>
      <h1 className="text-2xl font-bold">{c.title(learner.alias)}</h1>
      <p className="text-muted">{c.intro}</p>
      {rows === null ? (
        <p className="rounded-2xl border border-line bg-white p-4" data-testid="tutor-asks-unavailable">{c.unavailable}</p>
      ) : (
        <>
          <TutorAsksList learnerId={learner.id} rows={rows} />
          {rows.length >= TUTOR_ASKS_PAGE && last ? (
            <Link href={`/learners/${learner.id}/tutor-asks?before=${encodeURIComponent(last.at)}`} className="inline-flex min-h-11 items-center self-start text-accent underline">{c.older}</Link>
          ) : null}
        </>
      )}
    </div>
  );
}
