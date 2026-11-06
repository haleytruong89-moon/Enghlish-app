/** Small text helpers of the Studio screens (pure). */
import { studioCopy, studioErrors } from "@/lib/copy/vi";

/** The printed number of a Studio item (ids q<n>); other items keep their position number (weekly topics). */
export function questionNumber(itemId: string, index: number): number {
  const m = /^q([1-9][0-9]{0,2})$/.exec(itemId);
  return m ? Number(m[1]) : index + 1;
}
export const formatUsd = (n: number) => `$${n.toFixed(2)}`;
export const aiFailedText = (code: string | null) => studioCopy.aiFailedReason[code ?? ""] ?? studioCopy.aiFailedReason.ai_failed;
export const studioErrorText = (code: string | null | undefined) => (code && studioErrors[code]) || studioErrors.invalid;
