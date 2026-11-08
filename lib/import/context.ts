/**
 * The CLOSED list of tags the AI may name when it reads a paper test, and that the tutor may pick on the review screen: every in-use,
 * visible tag of the child's track (same list as the curriculum), plus whether it is a reading skill (stored apart from knowledge points).
 */
import { buildTocContext, type TocTag } from "@/lib/curriculum/context";
import type { SkillMapView } from "@/lib/skillmap/types";
import { READING_TAG_GROUP } from "@/lib/studio/context";
import type { TagInfo } from "@/lib/tutorwork/types";

export type ReadTag = TocTag & { reading: boolean };
export type ReadContext = { tags: ReadTag[] };

export function buildReadContext(map: SkillMapView, tags: TagInfo[]): ReadContext {
  const byKey = new Map(tags.map((t) => [t.key, t]));
  return { tags: buildTocContext(map, tags).tags.map((t) => ({ ...t, reading: byKey.get(t.key)?.group === READING_TAG_GROUP })) };
}
