"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { writingTags } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { SkillMapView } from "@/lib/skillmap/types";
import { MAX_WRITING_TAGS, type TagInfo } from "@/lib/tutorwork/types";
import { TagChips } from "./TagChips";
import { useTags } from "./useTags";

/** Tag chips under a piece of writing on the review screen (up to 3). Tags already saved stay ticked and cannot be removed. */
export function WritingTags({ learnerId, episodeId, tags: initialTags, saved, map }: { learnerId: string; episodeId: string; tags: TagInfo[]; saved: string[]; map: SkillMapView }) {
  const router = useRouter();
  const { tags, add, setGroup } = useTags(learnerId, initialTags);
  const [selected, setSelected] = useState<string[]>(saved);
  const [alreadySaved, setAlreadySaved] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);
  const { state: saveState, track } = useSaveStatus({ selected });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fresh = selected.filter((k) => !alreadySaved.includes(k));

  async function save() {
    if (fresh.length === 0) return setError(writingTags.needOne);
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await track(() => postJson(`/api/review/episodes/${episodeId}/tags`, { tags: selected }));
    setBusy(false);
    if (!r.ok) return setError(r.status === 400 ? writingTags.tooMany(MAX_WRITING_TAGS) : failText(r));
    setAlreadySaved(selected);
    setDone(true);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="writing-tags">
      <h2 className="text-lg font-semibold">{writingTags.title}</h2>
      <p className="text-sm text-muted">{writingTags.help}</p>
      <TagChips tags={tags} map={map} selected={selected} onChange={setSelected} max={MAX_WRITING_TAGS} locked={alreadySaved} onAdd={add} onSetGroup={setGroup} testId="writing-tag-chips" />
      {alreadySaved.length > 0 ? <p className="text-xs text-muted">{writingTags.alreadyTagged}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="writing-tags-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm font-semibold text-accent" data-testid="writing-tags-saved">
          {writingTags.saved}
        </p>
      ) : null}
      <SaveStatus state={saveState} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || fresh.length === 0}
        data-testid="writing-tags-save"
        className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60"
      >
        {busy ? writingTags.saving : writingTags.save}
      </button>
    </section>
  );
}
