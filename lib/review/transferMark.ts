/**
 * G4 / S1 / N4: who sees "Bài này ở chủ đề / nguồn mới (vận dụng)" on the review page, and in which form.
 * Only the child's tutor sets it (the database refuses anyone else); the parent never sees the box. Only a first attempt that is not a revision.
 *   hidden        - nothing shown
 *   tickable      - the tutor can tick / untick
 *   from_template - the template step already is a transfer_check: shown ticked and read-only, with a note
 */
export type TransferMarkMode = "hidden" | "tickable" | "from_template";

export function transferMarkMode(v: {
  viewer: { role: "tutor" | "parent"; canDecide: boolean };
  episode: { isFirstAttempt: boolean; facets: Record<string, boolean> };
  attempt: { mode: string };
}): TransferMarkMode {
  if (v.viewer.role !== "tutor" || !v.viewer.canDecide) return "hidden";
  if (!v.episode.isFirstAttempt || v.attempt.mode === "REVISION" || v.episode.facets.revision === true) return "hidden";
  return v.episode.facets.transfer_check === true ? "from_template" : "tickable";
}
