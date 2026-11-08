import Link from "next/link";
import { PendingTable } from "@/components/desk/PendingTable";
import { pendingCopy } from "@/lib/copy/vi";
import { loadPendingRows } from "@/lib/desk/load";
import { countGroups, filterRows, parseGroup } from "@/lib/desk/pending";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Chờ duyệt" of one child (tutor and parent; students 404 in the layout). Lists and links only — decisions stay on the detail pages. */
export default async function PendingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "work:review");
  const group = parseGroup(sp.f);
  const { rows, failed, more } = await loadPendingRows(member.id, member.role === "parent" ? "parent" : "tutor", learner.id);
  return (
    <div className="flex flex-col gap-4" data-testid="pending-page">
      <div>
        <h1 className="text-2xl font-bold">{pendingCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{pendingCopy.intro}</p>
      </div>
      {failed.map((s) => (
        <p key={s} role="status" data-testid={`pending-failed-${s}`} className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">
          {pendingCopy.failed(pendingCopy.sources[s])}
        </p>
      ))}
      <PendingTable learnerId={learner.id} rows={filterRows(rows, group)} group={group} counts={countGroups(rows)} />
      {more ? (
        <Link href={`/review?learner=${learner.id}`} data-testid="pending-more" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
          {pendingCopy.more}
        </Link>
      ) : null}
    </div>
  );
}
