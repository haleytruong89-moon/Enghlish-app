"use client";

import { useState } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { SkillMapView } from "@/lib/skillmap/types";
import { GroupPicker } from "./GroupPicker";

export type SetGroupFn = (key: string, groupKey: string) => Promise<{ ok: true } | { error: string }>;

/** "Xếp vào nhóm" next to a family tag that has no group yet (added before SM-1). Once saved the tag moves to its domain tab. */
export function SetGroupControl({ map, tagKey, onSetGroup }: { map: SkillMapView; tagKey: string; onSetGroup: SetGroupFn }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`set-group-${tagKey}`}
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-accent"
      >
        {skillMapCopy.setGroup}
      </button>
    );

  async function save() {
    if (group === null || busy) return;
    setBusy(true);
    setError(null);
    const r = await onSetGroup(tagKey, group);
    setBusy(false);
    if ("error" in r) setError(r.error);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <GroupPicker map={map} value={group} onChange={setGroup} testIdPrefix={`set-group-${tagKey}`} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || group === null}
        data-testid={`set-group-${tagKey}-save`}
        className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50"
      >
        {skillMapCopy.setGroupSave}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
