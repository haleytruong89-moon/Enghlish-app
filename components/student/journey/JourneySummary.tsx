import { journeyCopy } from "@/lib/copy/vi";
import type { JourneySummary as Summary } from "@/lib/journey/path";

/** "Đã xong 4/25 Unit · còn 7 Unit tới Progress Test 1" — counts of the child's own Units only (never a score). */
export function JourneySummary({ summary }: { summary: Summary }) {
  if (summary.kind === "none") return null;
  const text =
    summary.kind === "toMilestone"
      ? journeyCopy.summary.toMilestone(summary.done, summary.total, summary.remaining, summary.title)
      : summary.kind === "toSummit"
        ? journeyCopy.summary.toSummit(summary.done, summary.total, summary.remaining)
        : journeyCopy.summary.finished(summary.done, summary.total);
  return (
    <p className="mt-3 text-[15px] font-semibold text-accent" data-testid="journey-summary" data-count="work">
      {text}
    </p>
  );
}
