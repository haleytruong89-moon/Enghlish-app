import { studentReviewCopy } from "@/lib/copy/vi";
import type { ReviewItem } from "@/lib/levels/types";
import { groupReview } from "@/lib/levels/view";

/** "Việc cần ôn" on the student's home (P2-d, D12): at most 3 labels grouped by domain. No level, no score, no date, no count. */
export function ReviewByDomain({ items }: { items: ReviewItem[] }) {
  const groups = groupReview(items);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="review-by-domain-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="review-by-domain">
      <h2 id="review-by-domain-title" className="text-[15px] font-bold">
        {studentReviewCopy.title}
      </h2>
      <p className="text-sm text-muted">{studentReviewCopy.intro}</p>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.name} className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-muted">{g.name}</span>
            <ul className="flex flex-wrap gap-2">
              {g.labels.map((l) => (
                <li key={l} className="rounded-xl bg-[#f6e9df] px-3 py-1.5 text-sm text-[#5a2a0c]">
                  {l}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
