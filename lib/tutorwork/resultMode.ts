import type { ResultMode } from "./types";

/**
 * Which entry mode the result form starts in. The framed grid is not offered any more: it opens only for a result already recorded that
 * way, an assignment tied to a frame, or an explicit ?mode=frame without a chosen assignment. ?mode=frame with a non-frame assignment stays quick.
 */
export function startMode(o: { editMode: ResultMode | null; hasAssignment: boolean; assignmentHasFrame: boolean; framedUrl: boolean; hasFrames: boolean }): ResultMode {
  if (o.editMode) return o.editMode;
  if (o.hasAssignment) return o.assignmentHasFrame ? "frame" : "quick";
  return paperMode(o.framedUrl, o.hasFrames);
}

/** "Bài trên giấy" and "Ghi bài khác" go back to quick, unless the URL explicitly asked for the framed grid. */
export const paperMode = (framedUrl: boolean, hasFrames: boolean): ResultMode => (framedUrl && hasFrames ? "frame" : "quick");
