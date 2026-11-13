import { FEEDBACK_KINDS, type FeedbackKind } from "@/lib/workdesk/types";

/** `?kind=` of the feedback page: only the known kinds count; anything else falls back to the default. */
export function parseFeedbackKind(raw: string | string[] | undefined): FeedbackKind | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FEEDBACK_KINDS.find((k) => k === v);
}
