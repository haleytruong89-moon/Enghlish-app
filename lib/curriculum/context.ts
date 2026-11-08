/**
 * The CLOSED list a curriculum may link units to (DOMAIN §3 "Nối Unit → điểm", D-W1): every tag of the child's track that is in use
 * (seed, reading 0018, listening 0026, the family's own tags) and not hidden from the picker, with its place in the skill map so the AI
 * and the review screen can show "Mảng › Nhóm". Pure.
 */
import { placeOfTag } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";

export type TocTag = { key: string; label: string; domain: string | null; group: string | null; custom: boolean };
export type TocContext = { tags: TocTag[] };

export function buildTocContext(map: SkillMapView, tags: TagInfo[]): TocContext {
  const out: TocTag[] = [];
  for (const t of tags) {
    const place = placeOfTag(map, t);
    if (place?.hidden) continue;
    out.push({ key: t.key, label: t.label, domain: place?.domainName ?? null, group: place?.groupName ?? null, custom: t.custom });
  }
  return { tags: out };
}

export function tocTagOf(ctx: TocContext, key: string): TocTag | null {
  return ctx.tags.find((t) => t.key === key) ?? null;
}
