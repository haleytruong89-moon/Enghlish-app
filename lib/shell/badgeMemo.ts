/** When the number beside "Chờ duyệt" must be read again (pure). U1: remembered 30 s per child per tab; always re-read after a review page. */
export const BADGE_TTL_MS = 30_000;

/** Pages where something gets decided: leaving one of them changes the number. */
export const DECISION_PATHS: RegExp[] = [
  /^\/review(\/.*)?$/,
  /^\/studio\/drafts\/[^/]+$/,
  /^\/imports\/[^/]+$/,
  /^\/curricula\/versions\/[^/]+$/,
  /^\/learners\/[^/]+\/inbox$/,
];

export type BadgeMemo = { learnerId: string; at: number };

export function isDecisionPath(path: string | null): boolean {
  if (!path) return false;
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return DECISION_PATHS.some((re) => re.test(p));
}

export function shouldFetch(memo: BadgeMemo | null, learnerId: string, now: number, leftPath: string | null): boolean {
  if (!memo || memo.learnerId !== learnerId) return true;
  if (now - memo.at > BADGE_TTL_MS) return true;
  return isDecisionPath(leftPath);
}
