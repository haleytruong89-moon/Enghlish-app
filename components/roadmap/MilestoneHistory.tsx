import { roadmapCopy } from "@/lib/copy/vi";
import type { MilestoneVersion } from "@/lib/roadmap/types";
import { dateOf } from "@/lib/roadmap/view";

/** Every stored version of one milestone, newest first (the current one included): who sees what is in the status words. */
export function MilestoneHistory({ history }: { history: readonly MilestoneVersion[] }) {
  if (history.length <= 1) return null;
  return (
    <details className="text-sm" data-testid="ms-history">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted underline">{roadmapCopy.history.summary(history.length)}</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {history.map((h) => (
          <li key={h.id} className="flex flex-wrap gap-x-2">
            <time className="text-muted">{dateOf(h.createdAt)}</time>
            <span>{roadmapCopy.history.version(h.version)} · {roadmapCopy.status[h.status === "confirmed" ? "confirmed" : h.status === "draft" ? "draft" : "removed"]}</span>
            <span>{h.title}</span>
            {h.reason ? <span className="text-muted">{roadmapCopy.history.reason(h.reason)}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
