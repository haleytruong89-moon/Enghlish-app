"use client";

import { useState } from "react";
import { tagPicker } from "@/lib/copy/vi";

/** The "+ nhãn khác" box: type a name, add it as a tag of the family. `onAdd` returns the new key, or a message to show. */
export function AddTag({ onAdd, prefill = "" }: { onAdd: (label: string) => Promise<{ key: string } | { error: string }>; prefill?: string }) {
  const [label, setLabel] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const clean = label.trim();

  async function submit() {
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await onAdd(clean);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setDone(tagPicker.added(clean));
    setLabel("");
  }

  return (
    <div className="flex flex-col gap-1" data-testid="add-tag">
      <div className="flex flex-wrap items-center gap-2">
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
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || clean.length < 2}
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
