"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resultPage } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo, UntaggedItem } from "@/lib/tutorwork/types";
import { TagSelect } from "./TagSelect";
import { useTags, type AddTagFn } from "./useTags";

function PendingResult({
  item,
  tags,
  add,
  map,
  onSaved,
}: {
  item: UntaggedItem;
  tags: TagInfo[];
  add: AddTagFn;
  map: SkillMapView;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Record<number, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { state: saveState, track } = useSaveStatus({ picked });

  // Only the items that are still waiting (the list comes from the server again after every save) and have a tag chosen are sent,
  // so a partial save leaves the rest to be saved later.
  async function save() {
    const items = item.items.flatMap((n) => {
      const k = picked[n];
      return k ? [{ n, tag_key: k }] : [];
    });
    if (items.length === 0) return setError(resultPage.pendingNeed);
    setBusy(true);
    setError(null);
    const r = await track(() => postJson(`/api/results/${item.resultId}/tags`, { items }));
    setBusy(false);
    if (!r.ok) return setError(failText(r));
    setPicked({});
    onSaved();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line p-3" data-testid={`pending-${item.resultId}`}>
      <p className="text-sm font-semibold">
        {resultPage.pendingLine(item.title, formatDateVi(item.takenOn))}
        {item.usedHint ? <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs font-normal">{resultPage.hintYes}</span> : null}
      </p>
      {item.items.map((n) => (
        <div key={n} className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
          <span className="pt-2.5 text-sm font-medium">{resultPage.tagItem(n)}</span>
          <TagSelect
            tags={tags}
            map={map}
            value={picked[n] ?? null}
            onChange={(k) => setPicked((cur) => ({ ...cur, [n]: k }))}
            onAdd={add}
            label={`${item.title}: ${resultPage.tagItem(n)}`}
            testId={`pending-tag-${item.resultId}-${n}`}
          />
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <SaveStatus state={saveState} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        data-testid={`pending-save-${item.resultId}`}
        className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60"
      >
        {resultPage.pendingSave}
      </button>
    </li>
  );
}

/**
 * "Chờ gắn nhãn": wrong items that have no tag yet. The tutor tags first; the parent sees the tutor's items after 2 days and her own
 * at once (decided on the server). Saving some items keeps the rest in the list; the list is refreshed from the server after each save.
 */
export function PendingTags({ learnerId, items, tags: initialTags, isParent, map }: { learnerId: string; items: UntaggedItem[]; tags: TagInfo[]; isParent: boolean; map: SkillMapView }) {
  const router = useRouter();
  const { tags, add } = useTags(learnerId, initialTags);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section id="pending" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="pending-tags">
      <h2 className="text-lg font-semibold">{resultPage.pendingTitle}</h2>
      <p className="text-sm text-muted">{resultPage.pendingIntro(isParent)}</p>
      {message ? (
        <p role="status" className="text-sm font-semibold text-accent" data-testid="pending-saved">
          {message}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm">{resultPage.pendingEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <PendingResult
              key={i.resultId}
              item={i}
              tags={tags}
              add={add}
              map={map}
              onSaved={() => {
                setMessage(resultPage.pendingSaved);
                router.refresh();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
