import Link from "next/link";
import { home, inquiriesPage, learnerWithTrack, notesPage, targetsPage } from "@/lib/copy/vi";
import { safeColor, type LearnerSummary } from "@/lib/home/visible";

/** Staff view (parent/tutor): "An · Track A" + status in words (never colour alone). */
export function LearnerCard({ learner }: { learner: LearnerSummary }) {
  const color = safeColor(learner.color);
  return (
    <li
      className="rounded-xl border border-line bg-white px-5 py-4"
      style={{ borderLeft: `6px solid ${color}` }}
    >
      <div className="flex min-h-12 items-center justify-between gap-4">
        <span className="text-lg font-semibold" style={{ color }}>
          {learnerWithTrack(learner.alias, learner.trackId)}
        </span>
        <span className="text-sm text-muted">{learner.status === "active" ? home.learnerActive : home.learnerDraft}</span>
      </div>
      <Link
        href={`/learners/${learner.id}/targets`}
        className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
      >
        {targetsPage.link}
      </Link>
      <Link
        href={`/learners/${learner.id}/inquiries`}
        className="mt-1 ml-4 inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
      >
        {inquiriesPage.link}
      </Link>
      <Link
        href={`/learners/${learner.id}/notes`}
        className="mt-1 ml-4 inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
      >
        {notesPage.link}
      </Link>
    </li>
  );
}
