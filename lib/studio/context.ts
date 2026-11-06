/**
 * What the review screen and the AI prompt may offer for one child (spec §5.2, B-Q3; plan D8, P1): the tags of the child's track in the
 * skill map (not hidden) with their place around the current level (± 1, SM-2 P4-c), which of them are reading skills, their `related`
 * targets; and the skills Studio items may count for (eng_studio_skills = current set ∩ ACT-SOURCE-QA evidence tasks). Pure.
 */
import { nearLevel } from "@/lib/levels/scale";
import { placeOfTag } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";

/** error_tags.group_vi of the reading-skill tags (migration 0018). */
export const READING_TAG_GROUP = "Kỹ năng đọc";

export type StudioTag = { key: string; label: string; reading: boolean; near: boolean; related: string[]; group: string | null };
export type StudioSkill = { id: string; label: string };
export type StudioContext = { tags: StudioTag[]; skills: StudioSkill[] };

export function buildStudioContext(map: SkillMapView, tags: TagInfo[], skills: { id: string; title_vi: string }[]): StudioContext {
  const out: StudioTag[] = [];
  for (const t of tags) {
    const place = placeOfTag(map, t);
    if (place?.hidden) continue;
    const near = !place || place.leaf === null ? true : nearLevel(place.scale, map.current?.[place.domainKey], place.leaf);
    out.push({ key: t.key, label: t.label, reading: t.group === READING_TAG_GROUP, near, related: place?.leaf?.related ?? [], group: t.group });
  }
  return { tags: out, skills: skills.map((s) => ({ id: s.id, label: s.title_vi })) };
}

/** Tags sent to the AI: the ones around the child's current level (± 1). */
export function aiTagList(ctx: StudioContext): StudioTag[] {
  return ctx.tags.filter((t) => t.near);
}

export function tagOf(ctx: StudioContext, key: string | null): StudioTag | null {
  return key === null ? null : (ctx.tags.find((t) => t.key === key) ?? null);
}
