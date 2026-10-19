/**
 * When does the "Ghi bài ngoài app" form need (and send) a reason for an earlier date?
 * Only for paper work (manual_import) dated before the day the form allows without one (`minDate`), or after the server said the chosen
 * date was before the step opened (`stepNotOpen`, reset whenever the date or the kind of work changes). A reason that is no longer needed
 * is never sent: the database stores a reason it receives, even when it was not needed.
 */
export function needsBackdateReason(a: { paper: boolean; date: string; minDate: string; stepNotOpen: boolean }): boolean {
  return a.paper && (a.date < a.minDate || a.stepNotOpen);
}

/** The reason to put in the request body, or null when none is needed (or it is empty). */
export function backdateReasonToSend(a: { paper: boolean; date: string; minDate: string; stepNotOpen: boolean; reason: string }): string | null {
  if (!needsBackdateReason(a)) return null;
  const r = a.reason.trim();
  return r.length > 0 ? r : null;
}
