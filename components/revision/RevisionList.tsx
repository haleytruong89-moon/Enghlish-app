import Link from "next/link";
import { revisionReviewCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import type { RevisionListItem } from "@/lib/revision/types";

/** "Bài đã sửa" of one child (parent, tutor): one row per before–after pair, newest first; opens the read-only viewer. */
export function RevisionList({ learnerId, items }: { learnerId: string; items: RevisionListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="revisions-empty">
        {revisionReviewCopy.listEmpty}
      </p>
    );
  }
  return (
    <ul className="mt-6 flex flex-col gap-3" data-testid="revisions-list">
      {items.map((i) => (
        <li key={i.attemptId} data-testid={`revision-pair-${i.attemptId}`}>
          <Link href={`/learners/${learnerId}/revisions/${i.attemptId}`} className="flex flex-col gap-1 rounded-xl border border-line bg-white px-5 py-4 text-ink no-underline hover:bg-paper">
            <span className="font-semibold">{i.titleVi}</span>
            <span className="text-sm text-muted">
              {revisionReviewCopy.listLine(i.round, i.itemsCount)} · {formatWhen(i.submittedAt)} · {i.state === "done" ? revisionReviewCopy.stateDone : revisionReviewCopy.stateWaiting}
            </span>
            {i.state === "done" ? <span className="text-sm">{revisionReviewCopy.verdictSummary(i.good, i.itemsCount)}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
