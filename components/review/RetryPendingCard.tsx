// components/review/RetryPendingCard.tsx
import { studioCopy, studioInboxCopy } from "@/lib/copy/vi";
import type { RetryAttempt } from "@/lib/studio/types";

/** One attempt whose retries no adult has acted on yet: the retry text beside the original answer. Read-only; adults only. */
export function RetryPendingCard({ attempt }: { attempt: RetryAttempt }) {
  return (
    <li id={`retry-${attempt.attemptId}`} data-testid={`retry-card-${attempt.attemptId}`} className="scroll-mt-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="text-lg font-semibold">{studioInboxCopy.retryHeading(attempt.alias, attempt.title, attempt.retries.length)}</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {attempt.retries.map((r) => (
          <li key={r.itemId} className="flex flex-col gap-1 rounded-xl border border-line p-3" data-testid={`retry-item-${attempt.attemptId}-${r.itemId}`}>
            <p className="font-semibold">{studioCopy.itemLabel(r.n)}. <span lang="en" className="font-normal">{r.stem}</span></p>
            <p className="text-sm">{studioInboxCopy.retryFirst}: <span lang="en" className="font-semibold" data-testid="retry-given">{r.given || studioInboxCopy.blankAnswer}</span></p>
            <p className="text-sm">{studioInboxCopy.retryNow}: <span lang="en" className="font-semibold" data-testid="retry-text">{r.retry}</span></p>
          </li>
        ))}
      </ul>
    </li>
  );
}
