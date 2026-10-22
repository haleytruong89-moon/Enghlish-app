/** Browser-side: one sentence for a failed S6 call (no server-only imports). */
import { feedbackCopy } from "@/lib/copy/vi";
import { failText, type PostFail } from "@/lib/tutorwork/client";

export function revisionFailText(r: PostFail): string {
  return feedbackCopy.errors[r.error] ?? failText(r);
}
