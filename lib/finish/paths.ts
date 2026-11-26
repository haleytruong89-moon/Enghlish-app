/** L1 · "Xong một bài": the screen of one submission, or the queue of one child (opens the oldest). */
export const finishHref = (learnerId: string, attemptId?: string | null): string =>
  attemptId ? `/learners/${learnerId}/finish/${attemptId}` : `/learners/${learnerId}/finish`;

/** Is this link one of the "Xong một bài" screens? */
export const isFinishHref = (href: string): boolean => /^\/learners\/[^/]+\/finish(\/|$)/.test(href);

/** The anchor of one part on the "Xong một bài" screen (ids allow only a safe set of characters). */
export const partAnchor = (key: string): string => `part-${key.replace(/[^A-Za-z0-9_-]/g, "-") || "all"}`;
