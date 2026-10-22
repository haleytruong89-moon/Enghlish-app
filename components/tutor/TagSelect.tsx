"use client";

import { useState } from "react";
import { resultPage, skillMapCopy, tagPicker } from "@/lib/copy/vi";
import { groupTags } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";
import type { AddTagFn } from "./useTags";

const NEW = "__new__";

/** One tag for one wrong item: a native select grouped as "Mảng · Nhóm" of the skill map, the current level ± 1 first (P4-c), plus "+ nhãn khác". */
export function TagSelect({
  tags,
  map,
  value,
  onChange,
  onAdd,
  label,
  testId,
}: {
  tags: TagInfo[];
  map: SkillMapView;
  value: string | null;
  onChange: (key: string | null) => void;
  onAdd: AddTagFn;
  label: string;
  testId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const buckets = groupTags(map, tags, { keep: value ? [value] : [] });

  async function addAndPick(l: string, groupKey: string) {
    const r = await onAdd(l, groupKey);
    if ("key" in r) {
      onChange(r.key);
      setAdding(false);
    }
    return r;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <select
        aria-label={label}
        data-testid={testId}
        value={adding ? NEW : (value ?? "")}
        onChange={(e) => {
          if (e.target.value === NEW) return setAdding(true);
          setAdding(false);
          onChange(e.target.value === "" ? null : e.target.value);
        }}
        className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-sm"
      >
        <option value="">{resultPage.tagNone}</option>
        {[false, true].flatMap((far) =>
          buckets.flatMap((b) =>
            (far ? b.far : b.groups).map((g) => {
              const place = b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name);
              return (
                <optgroup key={`${far ? "far" : "near"}:${b.key}:${g.key}`} label={far ? skillMapCopy.farPlace(place) : place}>
                  {g.items.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              );
            }),
          ),
        )}
        <option value={NEW}>{tagPicker.addOther}</option>
      </select>
      {adding ? <AddTag map={map} onAdd={addAndPick} /> : null}
    </div>
  );
}
