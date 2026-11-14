/** Browser-side words for a failed call of the 3B routes (no server-only imports). */
import { absenceCopy } from "@/lib/copy/vi";
import { failText, type PostFail } from "@/lib/tutorwork/client";

export function sessionFailText(r: PostFail): string {
  if (r.status !== 0 && absenceCopy.errors[r.error]) return absenceCopy.errors[r.error]!;
  return failText(r);
}
