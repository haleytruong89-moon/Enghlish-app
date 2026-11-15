/**
 * W4c2 · the child's screen after submitting (S-10). Parses eng_my_result_view with STRICT keys: anything the database might add later
 * (an answer, an explanation, a count) is refused here, so it can never reach the browser.
 */
import { z } from "zod";

export type ResultLook = { id: string; n: number; stem: string; given: string; retryText: string | null; canRetry: boolean };
export type ResultOpen = { id: string; n: number; stem: string; given: string };
export type ResultView = {
  attemptNo: number;
  submittedAt: string;
  isTest: boolean;
  look: ResultLook[];
  open: ResultOpen[];
  /** One flag, never a number: some other items need nothing more. */
  othersFine: boolean;
};

const schema = z.strictObject({
  attempt_no: z.number().int(),
  submitted_at: z.string(),
  is_test: z.boolean(),
  others_fine: z.boolean(),
  look: z.array(
    z.strictObject({
      id: z.string(),
      n: z.number().int(),
      stem: z.string(),
      given: z.string(),
      retry: z.strictObject({ text: z.string() }).nullable(),
      can_retry: z.boolean(),
    }),
  ),
  open: z.array(z.strictObject({ id: z.string(), n: z.number().int(), stem: z.string(), given: z.string() })),
});

/** null / {} / anything unexpected → null (the page then shows the plain receipt). */
export function parseResultView(raw: unknown): ResultView | null {
  if (raw === null || raw === undefined) return null;
  const r = schema.safeParse(raw);
  if (!r.success) return null;
  const v = r.data;
  return {
    attemptNo: v.attempt_no,
    submittedAt: v.submitted_at,
    isTest: v.is_test,
    othersFine: v.others_fine,
    look: v.look.map((x) => ({ id: x.id, n: x.n, stem: x.stem, given: x.given, retryText: x.retry?.text ?? null, canRetry: x.can_retry })),
    open: v.open,
  };
}

export type ResultGroups = {
  /** Items to look at again (a retry button only when the work is practice AND the item has none yet). */
  look: ResultLook[];
  /** Free-writing / not yet marked: "the tutor will read this". */
  open: ResultOpen[];
  /** "Các câu còn lại: ổn" - shown only when there is something else and it is fine. */
  showOthersFine: boolean;
  /** Nothing at all to look at (all fine): the screen says so in one line. */
  nothing: boolean;
  /** A test has no retry, whatever the items say. */
  retryAllowed: boolean;
};

export function groupResult(v: ResultView): ResultGroups {
  const look = v.look.map((x) => ({ ...x, canRetry: v.isTest ? false : x.canRetry }));
  return { look, open: v.open, showOthersFine: v.othersFine, nothing: look.length === 0 && v.open.length === 0, retryAllowed: !v.isTest };
}
