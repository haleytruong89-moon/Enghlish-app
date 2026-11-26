/** L1 · "Xong một bài": the screen of one submission, or the queue of one child (opens the oldest). */
export const finishHref = (learnerId: string, attemptId?: string | null): string =>
  attemptId ? `/learners/${learnerId}/finish/${attemptId}` : `/learners/${learnerId}/finish`;

/** Is this link one of the "Xong một bài" screens? */
export const isFinishHref = (href: string): boolean => /^\/learners\/[^/]+\/finish(\/|$)/.test(href);
