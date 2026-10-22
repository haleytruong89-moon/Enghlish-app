"use client";

import { useState } from "react";
import { skillMapCopy, tagPicker } from "@/lib/copy/vi";
import type { DomainKey, SkillMapView } from "@/lib/skillmap/types";
import { GroupPicker } from "./GroupPicker";
import type { AddTagFn } from "./useTags";

/** "+ nhãn khác": a name and its place in the skill map — domain and group are both required (SM-1, spec M3). */
export function AddTag({
  map,
  onAdd,
  defaultDomain = null,
  prefill = "",
}: {
  map: SkillMapView;
  onAdd: AddTagFn;
  defaultDomain?: DomainKey | null;
  prefill?: string;
}) {
  const [label, setLabel] = useState(prefill);
  const [group, setGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const clean = label.trim();
  const ready = clean.length >= 2 && group !== null;

  async function submit() {
    if (busy || clean.length < 2) return;
    if (group === null) return setError(skillMapCopy.groupRequired);
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await onAdd(clean, group);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setDone(tagPicker.added(clean));
    setLabel("");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="add-tag">
      <input
        type="text"
        aria-label={tagPicker.addTitle}
        placeholder={tagPicker.addOther}
        maxLength={120}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        data-testid="add-tag-input"
        className="min-h-11 min-w-0 rounded-lg border border-line px-3 text-sm"
      />
      <div className="flex flex-wrap items-end gap-2">
        <GroupPicker map={map} value={group} onChange={setGroup} testIdPrefix="add-tag" defaultDomain={defaultDomain} />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !ready}
          data-testid="add-tag-button"
          className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50"
        >
          {clean.length >= 2 ? tagPicker.addNamed(clean) : tagPicker.addOther}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-accent">
          {done}
        </p>
      ) : null}
    </div>
  );
}
