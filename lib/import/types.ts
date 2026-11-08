/** Shared shapes and limits of "Nạp bài đã làm" (W3). Pure. */
export const IMPORT_LIMITS = { questions: 200, part: 20, answer: 300, title: 120 } as const;
export const READ_RESULTS = ["correct", "incorrect", "blank", "needs_person"] as const;
export type ReadResult = (typeof READ_RESULTS)[number];
export const READ_CONFIDENCE = ["high", "low"] as const;

/** One question after the AI read it and the code compared it with the key. `result` is computed by code, never by the AI. */
export type ReadItem = {
  n: number;
  part: string;
  student_answer: string | null;
  key_answer: string | null;
  tag: string | null;
  out_of_app: boolean;
  confidence: (typeof READ_CONFIDENCE)[number];
  result: ReadResult;
};
export type ReadPayload = { items: ReadItem[] };

/** Who helped (DOMAIN §5 "mức hỗ trợ"): stored on the batch and on the imported attempt. */
export const SUPPORT_LEVELS = ["tu_lam", "tu_lam_chua", "lam_cung_co"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];
export const IMPORT_STATUSES = ["reading", "ai_failed", "draft", "confirmed", "discarded"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
/** A read that is still "reading" after this long is treated as failed (the background job died). */
export const STALE_READING_MS = 6 * 60_000;
