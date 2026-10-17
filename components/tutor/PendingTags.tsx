"use client";

import { useState } from "react";
import { resultPage } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { TagInfo, UntaggedItem } from "@/lib/tutorwork/types";
import { TagSelect } from "./TagSelect";
import { useTags } from "./useTags";

function PendingResult({ item, tags, add }: { item: UntaggedItem; tags: TagInfo[]; add: (label: string) => Promise<{ key: string } | { error: string }> }) {
  const [picked, setPicked] = useState<Record<number, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const items = item.items.flatMap((n) => {
      const k = picked[n];
      return k ? [{ n, tag_key: k }] : [];
    });
    if (items.length === 0) return setError(resultPage.pendingNeed);
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/results/${item.resultId}/tags`, { items });
    setBusy(false);
    if (!r.ok) return setError(failText(r));
    setDone(true);
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
      {done ? (
        <p role="status" className="text-sm font-semibold text-accent" data-testid="pending-saved">
          {resultPage.pendingSaved}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          data-testid={`pending-save-${item.resultId}`}
          className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {resultPage.pendingSave}
        </button>
      )}
    </li>
  );
}

/** "Chờ gắn nhãn": wrong items that have no tag yet. The tutor tags first; the parent sees them after 2 days (decided on the server). */
export function PendingTags({
  learnerId,
  items,
  tags: initialTags,
  isParent,
}: {
  learnerId: string;
  items: UntaggedItem[];
  tags: TagInfo[];
  isParent: boolean;
}) {
  const { tags, add } = useTags(learnerId, initialTags);
  return (
    <section id="pending" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="pending-tags">
      <h2 className="text-lg font-semibold">{resultPage.pendingTitle}</h2>
      <p className="text-sm text-muted">{resultPage.pendingIntro(isParent)}</p>
      {items.length === 0 ? (
        <p className="text-sm">{resultPage.pendingEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <PendingResult key={i.resultId} item={i} tags={tags} add={add} />
          ))}
        </ul>
      )}
    </section>
  );
}
