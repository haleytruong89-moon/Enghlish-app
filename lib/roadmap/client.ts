/** Browser-side words for a failed call of the roadmap routes (no server-only imports). */
import { roadmapCopy } from "@/lib/copy/vi";
import { failText, type PostFail } from "@/lib/tutorwork/client";

export function roadmapFailText(r: PostFail): string {
  if (r.status !== 0 && roadmapCopy.errors[r.error]) return roadmapCopy.errors[r.error]!;
  return failText(r);
}
