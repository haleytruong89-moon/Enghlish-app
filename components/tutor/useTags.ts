"use client";

import { useCallback, useState } from "react";
import { tagPicker } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { TagInfo } from "@/lib/tutorwork/types";

/** The tag list of one child plus "+ nhãn khác": adding a tag calls the server (which makes the key) and extends the list. */
export function useTags(learnerId: string, initial: TagInfo[]) {
  const [tags, setTags] = useState<TagInfo[]>(initial);
  const add = useCallback(
    async (label: string): Promise<{ key: string } | { error: string }> => {
      const r = await postJson<{
        key: string;
        label: string;
        created: boolean;
      }>(`/api/learners/${learnerId}/tags`, { label });
      if (!r.ok) return { error: failText(r) };
      const { key, label: saved } = r.body;
      setTags((cur) => (cur.some((t) => t.key === key) ? cur : [...cur, { key, label: saved, group: tagPicker.customGroup, custom: true }]));
      return { key };
    },
    [learnerId],
  );
  return { tags, add };
}
