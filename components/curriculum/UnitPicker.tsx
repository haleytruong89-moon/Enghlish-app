"use client";

import Link from "next/link";
import { fallbackLabels, unitPickerCopy } from "@/lib/copy/vi";
import { formatRange } from "@/lib/prefill";
import {
  derivedItems, isReviewTicked, isUnitTicked, toggleReview, toggleUnit, type PickerState, type UnitChoice,
} from "@/lib/curriculum/unitPicker";

const SHOWN_ITEMS = 6;

/**
 * Ticks Units (and Review / Progress Test rows, which tick the Units they revise). Adults only: students never see Units or items.
 * `compact` = Studio / Nạp bài: collapsed by default, only fills the title (no item line).
 */
export function UnitPicker({
  learnerId,
  choices,
  state,
  onChange,
  tagLabels = {},
  compact = false,
  disabled,
  testId = "unit-picker",
}: {
  learnerId: string;
  choices: UnitChoice[];
  state: PickerState;
  onChange: (s: PickerState) => void;
  tagLabels?: Record<string, string>;
  compact?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  if (choices.length === 0) {
    return (
      <p className="text-sm text-muted" data-testid={`${testId}-none`}>
        {unitPickerCopy.none}{" "}
        <Link href={`/learners/${learnerId}/curricula`} className="text-accent underline">
          {unitPickerCopy.noneLink}
        </Link>
      </p>
    );
  }
  const items = derivedItems(choices, state);
  const shown = items.slice(0, SHOWN_ITEMS).map((k) => tagLabels[k] ?? fallbackLabels.tag);
  const body = (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-sm text-muted">{compact ? unitPickerCopy.helpTitleOnly : unitPickerCopy.help}</p>
      {choices.map((c) => (
        <details key={c.curriculumId} open={compact ? undefined : true} className="rounded-xl border border-line px-3 py-2" data-testid={`${testId}-${c.curriculumId}`}>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{c.title}</summary>
          <ul className="flex flex-col gap-1 pb-2">
            {c.units.map((u) => {
              const on = isUnitTicked(state, c.curriculumId, u.code);
              return (
                <li key={u.code}>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => onChange(toggleUnit(state, choices, c.curriculumId, u.code))} data-testid={`unit-${c.curriculumId}-${u.code}`} className="h-5 w-5" />
                    {unitPickerCopy.unitLine(u.code, u.title, unitPickerCopy.statuses[u.status] || null)}
                  </label>
                </li>
              );
            })}
            {c.reviews.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-11 items-center gap-2 text-sm italic">
                  <input type="checkbox" checked={isReviewTicked(state, c.curriculumId, r.id)} disabled={disabled} onChange={() => onChange(toggleReview(state, choices, c.curriculumId, r.id))} data-testid={`review-${c.curriculumId}-${r.id}`} className="h-5 w-5" />
                  {r.label}
                  {r.related.length > 0 ? <span className="not-italic text-muted"> · {unitPickerCopy.reviewHint(formatRange(r.related))}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {!compact && state.units.length > 0 ? (
        <p className="rounded-xl bg-[#eef3ef] px-3.5 py-2 text-sm" aria-live="polite" data-testid={`${testId}-derived`}>
          {items.length > 0 ? unitPickerCopy.derived(items.length, shown.join(", "), items.length - shown.length) : unitPickerCopy.derivedNone}
        </p>
      ) : null}
    </div>
  );
  return body;
}
