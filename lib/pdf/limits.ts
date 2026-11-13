/**
 * How many PDF pages one AI job can read, derived from the code (UX round 2, plan "Phân tích 5"; estimates, see V13 below).
 * Pure: used by the page picker in the browser, never imported with a secret.
 *
 *  - Output budget: Studio `save_exercise` max 32 000 tokens (EXTRACT_MAX_TOKENS), Nạp bài `read_answers` 16 000 (READ_MAX_TOKENS), Giáo trình
 *    `curriculum_toc` 16 000 (TOC_MAX_TOKENS). A Studio question is ~250–350 output tokens (stem, options, key, explanation ≤ 300 chars, tag),
 *    plus the reading passages copied word for word; an import row ~50–70 tokens; a Unit ~120–200 tokens.
 *  - Time budget: one background call may run at most 240 s (MAX_CALL_MS), the whole job 280 s, nothing new starts with < 60 s left. At an
 *    assumed 60–90 output tokens/s a call is cut at ~14k–21k tokens, so Studio is time-bound at ~45–60 questions (not the 90 the token cap
 *    would allow). A call that runs the full 240 s leaves no time to retry: the money is spent and the job fails.
 *  - Claude API: at most 100 PDF pages per request; each page costs ~1 500–3 000 text tokens plus the page image.
 *  - Rule of thumb: Studio test 3–6 pages (~60 questions) + answers 1–3 pages; import work ≤ 8 pages (~100 questions) + answers 1–3; TOC 1–4 pages.
 *
 * V13: the tokens/second figure is an assumption; re-measure on the first three real runs (gap between the `ai_runs` placeholder row and the
 * ledger row) and adjust the numbers here - this is the only place that holds them.
 */
export type PdfUse = "studio_test" | "studio_key" | "import_work" | "import_key" | "curriculum_toc" | "assignment_pdf";
export type PdfFlow = "studio" | "import" | "toc" | "assignment";

export const PAGE_LIMITS: Record<PdfFlow, { recommend: string; warnMain: number; warnTotal: number; blockMain: number; blockTotal: number }> = {
  studio: { recommend: "3–6", warnMain: 6, warnTotal: 9, blockMain: 10, blockTotal: 12 },
  import: { recommend: "≤ 8", warnMain: 8, warnTotal: 10, blockMain: 12, blockTotal: 15 },
  toc: { recommend: "1–4", warnMain: 4, warnTotal: 4, blockMain: 8, blockTotal: 8 },
  assignment: { recommend: "", warnMain: Infinity, warnTotal: Infinity, blockMain: Infinity, blockTotal: Infinity },
};

export const AI_BASIS = {
  studioMaxTokens: 32000,
  readMaxTokens: 16000,
  tocMaxTokens: 16000,
  callMs: 240_000,
  jobMs: 280_000,
  assumedTokensPerSec: [60, 90],
} as const;

/** Size limit of a file kept in storage (MAX_FILE_BYTES in lib/storage) - checked on the CUT file. */
export const MAX_CUT_BYTES = 15 * 1024 * 1024;
/** Above this a browser may struggle to open a PDF at all: only a hint is shown. */
export const BIG_SOURCE_BYTES = 150 * 1024 * 1024;

export function checkPages(flow: PdfFlow, main: number, other: number): { level: "ok" | "warn" | "block"; messageKey: string } {
  const l = PAGE_LIMITS[flow];
  const total = main + other;
  if (main > l.blockMain || total > l.blockTotal) return { level: "block", messageKey: `${flow}_block` };
  if (main > l.warnMain || total > l.warnTotal) return { level: "warn", messageKey: `${flow}_warn` };
  return { level: "ok", messageKey: `${flow}_ok` };
}
