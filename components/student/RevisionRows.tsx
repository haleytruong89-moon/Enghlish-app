import Link from "next/link";
import { revisionCopy } from "@/lib/copy/vi";
import type { MyFeedbackItem } from "@/lib/revision/types";

/** "Sửa bài" rows at the top of Việc tiếp theo (spec §2 step 3): to do first, then "đã nộp" (waiting). No score, no verdict. */
export function RevisionRows({ items }: { items: MyFeedbackItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={revisionCopy.pageTitle} className="flex flex-col gap-2" data-testid="revision-rows">
      {items.map((i) =>
        i.state === "todo" ? (
          <Link key={i.feedbackId} href={`/activities/${i.activityId}`} data-testid={`revision-row-${i.activityId}`}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-accent bg-white px-4 py-3 no-underline">
            <span className="flex min-w-0 flex-col">
              <span className="font-bold text-ink">{revisionCopy.rowTitle(i.titleVi)}</span>
              <span className="text-[13px] text-muted">{revisionCopy.rowLine(i.itemsCount)}</span>
            </span>
            <span className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white">{revisionCopy.start}</span>
          </Link>
        ) : (
          <p key={i.feedbackId} data-testid={`revision-row-${i.activityId}`} className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <b>{revisionCopy.rowTitle(i.titleVi)}</b> · {revisionCopy.submittedRow}
          </p>
        ),
      )}
    </section>
  );
}
