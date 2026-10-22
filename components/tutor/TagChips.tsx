"use client";

import { useMemo, useState } from "react";
import { fallbackLabels, skillMapCopy, tagPicker } from "@/lib/copy/vi";
import { domainOfAdded, firstTab, groupTags, placeOfTag } from "@/lib/skillmap/group";
import { isDomainKey, UNASSIGNED, type SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";
import { DomainTabs } from "./DomainTabs";
import { SetGroupControl, type SetGroupFn } from "./SetGroupControl";
import type { AddTagFn } from "./useTags";

/**
 * Pick up to `max` tags as chips, by domain of the skill map (SM-1): tabs, group headings, quick search, "+ nhãn khác" (domain + group
 * required). `locked` keys are already saved: shown ticked and cannot be removed (append-only). A leaf hidden from the picker shows only
 * when it is already chosen. Family tags without a group sit under "Chưa xếp mảng", with "Xếp vào nhóm" when `onSetGroup` is given.
 */
export function TagChips({
  tags,
  map,
  selected,
  onChange,
  max,
  locked = [],
  onAdd,
  onSetGroup,
  testId = "tag-chips",
}: {
  tags: TagInfo[];
  map: SkillMapView;
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
  locked?: string[];
  onAdd: AddTagFn;
  onSetGroup?: SetGroupFn;
  testId?: string;
}) {
  const keep = [...selected, ...locked];
  const keepKey = keep.join("|");
  const buckets = useMemo(() => groupTags(map, tags, { keep: keepKey ? keepKey.split("|") : [] }), [map, tags, keepKey]);
  const [tab, setTab] = useState<string>(() => firstTab(buckets, (t) => selected.includes(t.key)));
  const active = buckets.some((b) => b.key === tab) ? tab : firstTab(buckets);
  const full = selected.length >= max;
  const labelOf = new Map(tags.map((t) => [t.key, t.label]));

  function toggle(key: string) {
    if (locked.includes(key)) return;
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else if (!full) onChange([...selected, key]);
  }

  async function addAndSelect(label: string, groupKey: string) {
    const r = await onAdd(label, groupKey);
    if ("key" in r) {
      // The tag may have matched an existing one with another group: follow what the server returned, not what was asked for.
      const d = domainOfAdded(map, r);
      if (d) setTab(d);
      if (!full && !selected.includes(r.key)) onChange([...selected, r.key]);
    }
    return r;
  }

  function chip(t: TagInfo) {
    const on = selected.includes(t.key);
    const isLocked = locked.includes(t.key);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={isLocked || (!on && full)}
        onClick={() => toggle(t.key)}
        data-testid={`tag-chip-${t.key}`}
        className={`min-h-11 rounded-full border px-4 text-sm ${
          on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"
        } disabled:opacity-60`}
      >
        {on ? "✓ " : ""}
        {t.label}
        {t.custom ? <span className="ml-1 text-xs opacity-80">({tagPicker.customTag})</span> : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-sm text-muted" aria-live="polite">
        {full ? tagPicker.maxReached(max) : tagPicker.selected(selected.length, max)}
      </p>
      {selected.length > 0 ? (
        <p className="text-sm" data-testid={`${testId}-chosen`}>
          {skillMapCopy.chosen(selected.map((k) => labelOf.get(k) ?? fallbackLabels.tag).join(", "))}
        </p>
      ) : null}
      <DomainTabs
        buckets={buckets}
        active={active}
        onActive={setTab}
        testId={testId}
        itemKey={(t) => t.key}
        itemText={(t) => t.label}
        renderItem={(t) => (
          <span className="flex flex-wrap items-center gap-2">
            {chip(t)}
            {onSetGroup && t.custom && placeOfTag(map, t) === null ? <SetGroupControl map={map} tagKey={t.key} onSetGroup={onSetGroup} /> : null}
          </span>
        )}
      />
      {active === UNASSIGNED ? <p className="text-xs text-muted">{skillMapCopy.unassignedHelp}</p> : null}
      <AddTag map={map} onAdd={addAndSelect} defaultDomain={isDomainKey(active) ? active : null} />
    </div>
  );
}
