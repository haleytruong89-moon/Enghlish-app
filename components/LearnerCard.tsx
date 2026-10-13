import { home, learnerWithTrack } from "@/lib/copy/vi";
import { safeColor, type LearnerSummary } from "@/lib/home/visible";

/** Staff view (parent/tutor): "An · Track A" + status in words (never colour alone). */
export function LearnerCard({ learner }: { learner: LearnerSummary }) {
  const color = safeColor(learner.color);
  return (
    <li
      className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-line bg-white px-5 py-4"
      style={{ borderLeft: `6px solid ${color}` }}
    >
      <span className="text-lg font-semibold" style={{ color }}>
        {learnerWithTrack(learner.alias, learner.trackId)}
      </span>
      <span className="text-sm text-muted">{learner.status === "active" ? home.learnerActive : home.learnerDraft}</span>
    </li>
  );
}
