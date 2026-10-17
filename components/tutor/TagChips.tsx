"use client";

import { useState } from "react";
import { tagPicker } from "@/lib/copy/vi";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";

/**
 * Pick up to `max` tags as chips, with a search box and "+ nhãn khác". `locked` keys are already saved: shown ticked and cannot
 * be removed (the history is append-only). Selection is controlled by the parent form.
 */
export function TagChips({
  tags,
  selected,
  onChange,
  max,
  locked = [],
  onAdd,
  testId = "tag-chips",
}: {
  tags: TagInfo[];
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
  locked?: string[];
  onAdd: (label: string) => Promise<{ key: string } | { error: string }>;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? tags.filter((t) => t.label.toLowerCase().includes(q) || (t.group ?? "").toLowerCase().includes(q)) : tags;
  const full = selected.length >= max;

  function toggle(key: string) {
    if (locked.includes(key)) return;
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else if (!full) onChange([...selected, key]);
  }

  async function addAndSelect(label: string) {
    const r = await onAdd(label);
    if ("key" in r && !full && !selected.includes(r.key)) onChange([...selected, r.key]);
    return r;
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-sm text-muted" aria-live="polite">
        {full ? tagPicker.maxReached(max) : tagPicker.selected(selected.length, max)}
      </p>
      {tags.length > 12 ? (
        <input
          type="search"
          aria-label={tagPicker.search}
          placeholder={tagPicker.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-lg border border-line px-3 text-sm"
        />
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {shown.map((t) => {
          const on = selected.includes(t.key);
          const isLocked = locked.includes(t.key);
          return (
            <li key={t.key}>
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
            </li>
          );
        })}
        {shown.length === 0 ? <li className="text-sm text-muted">{tagPicker.noMatch}</li> : null}
      </ul>
      <AddTag onAdd={addAndSelect} />
    </div>
  );
}
