"use client";

import { useState } from "react";
import { resultPage, tagPicker } from "@/lib/copy/vi";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";

const NEW = "__new__";

/** One tag for one wrong item: a select grouped by topic (native, phone-friendly) plus "+ nhãn khác". */
export function TagSelect({
  tags,
  value,
  onChange,
  onAdd,
  label,
  testId,
}: {
  tags: TagInfo[];
  value: string | null;
  onChange: (key: string | null) => void;
  onAdd: (label: string) => Promise<{ key: string } | { error: string }>;
  label: string;
  testId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const groups = [...new Set(tags.map((t) => t.group ?? ""))];

  async function addAndPick(l: string) {
    const r = await onAdd(l);
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
        {groups.map((g) => (
          <optgroup key={g || "other"} label={g || resultPage.tagPick}>
            {tags
              .filter((t) => (t.group ?? "") === g)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
          </optgroup>
        ))}
        <option value={NEW}>{tagPicker.addOther}</option>
      </select>
      {adding ? <AddTag onAdd={addAndPick} /> : null}
    </div>
  );
}
