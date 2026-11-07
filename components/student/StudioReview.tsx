// components/student/StudioReview.tsx
"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { studioStudentCopy, work } from "@/lib/copy/vi";
import type { StudioReviewView } from "@/lib/studio/types";
import { formatHm } from "@/lib/work/view";

/** "Câu cần xem lại" (board 20). Wrong items with the right answer and why; the waiting numbers; never a score or a count of right items. */
export function StudioReview({ review, children }: { review: StudioReviewView; children?: ReactNode }) {
  const [again, setAgain] = useState(false);
  if (again) return <>{children}</>;
  return (
    <section aria-labelledby="studio-review-title" data-testid="studio-review" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <p role="status" className="text-sm font-semibold text-accent">{work.submittedAt(formatHm(review.submittedAt))}</p>
      <h2 id="studio-review-title" className="text-xl font-bold">{studioStudentCopy.title}</h2>
      {review.wrong.length === 0 && review.pending.length === 0 ? <p className="text-[15px]">{studioStudentCopy.nothingToReview}</p> : null}
      {review.wrong.length > 0 ? <p className="text-sm text-muted">{studioStudentCopy.intro}</p> : null}
      <ul className="flex flex-col gap-3">
        {review.wrong.map((w) => (
          <li key={w.n} data-testid={`studio-wrong-${w.n}`} className="flex flex-col gap-1 rounded-xl border border-line p-3">
            <p className="font-semibold">{work.questionLabel(w.n)}. <span lang="en" className="font-normal">{w.stem}</span></p>
            <p className="text-sm">{w.given.trim() ? <>{studioStudentCopy.youWrote}: <span lang="en">{w.given}</span></> : studioStudentCopy.blank}</p>
            {w.expected ? <p className="text-sm">{studioStudentCopy.shouldBe}: <b lang="en">{w.expected}</b></p> : null}
            {w.explanationVi ? <p className="text-sm text-muted">{studioStudentCopy.why}: {w.explanationVi}</p> : null}
          </li>
        ))}
      </ul>
      {review.pending.length > 0 ? (
        <div data-testid="studio-pending" className="rounded-xl border-2 border-dashed border-line p-3 text-sm">
          <p className="font-semibold">{studioStudentCopy.pending(review.pending.length)}</p>
          <p className="text-muted">{studioStudentCopy.pendingList(review.pending)}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Link href="/" data-testid="studio-home" className="flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-bold text-white">{studioStudentCopy.home}</Link>
        <button type="button" data-testid="studio-retry" onClick={() => setAgain(true)} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">{studioStudentCopy.retry}</button>
      </div>
    </section>
  );
}
