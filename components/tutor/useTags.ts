"use client";

import { useCallback, useState } from "react";
import { tagPicker } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { TagInfo } from "@/lib/tutorwork/types";
import type { SetGroupFn } from "./SetGroupControl";

export type AddTagFn = (label: string, groupKey: string) => Promise<{ key: string } | { error: string }>;

/**
 * The tag list of one child plus "+ nhãn khác" (the server makes the key; a group of the skill map is required) and "Xếp vào nhóm"
 * for a family tag that has no group yet. Both update the list in place, so the tag moves to its domain tab at once.
 */
export function useTags(learnerId: string, initial: TagInfo[]) {
  const [tags, setTags] = useState<TagInfo[]>(initial);
  const add = useCallback<AddTagFn>(
    async (label, groupKey) => {
      const r = await postJson<{ key: string; label: string; group_key: string | null; created: boolean }>(`/api/learners/${learnerId}/tags`, {
        label,
        group_key: groupKey,
      });
      if (!r.ok) return { error: failText(r) };
      const { key, label: saved, group_key } = r.body;
      setTags((cur) =>
        cur.some((t) => t.key === key)
          ? cur.map((t) => (t.key === key && t.custom ? { ...t, groupKey: group_key } : t))
          : [...cur, { key, label: saved, group: tagPicker.customGroup, custom: true, groupKey: group_key }],
      );
      return { key };
    },
    [learnerId],
  );
  const setGroup = useCallback<SetGroupFn>(
    async (key, groupKey) => {
      const r = await postJson<{ key: string; group_key: string; changed: boolean }>(`/api/learners/${learnerId}/tags/group`, { tag_key: key, group_key: groupKey });
      if (!r.ok) return { error: failText(r) };
      setTags((cur) => cur.map((t) => (t.key === key ? { ...t, groupKey: r.body.group_key } : t)));
      return { ok: true as const };
    },
    [learnerId],
  );
  return { tags, add, setGroup };
}
