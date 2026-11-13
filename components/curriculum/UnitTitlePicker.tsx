"use client";

import { useState } from "react";
import { UnitPicker } from "@/components/curriculum/UnitPicker";
import { unitPickerCopy } from "@/lib/copy/vi";
import { autoTitle, stateFromCodes, type PickerState, type UnitChoice } from "@/lib/curriculum/unitPicker";

/**
 * Tạo bài từ đề / Nạp bài đã làm: a folded Unit picker that ONLY fills the name of the bài (V11). The Units are not saved with the draft
 * and nothing about them goes to the AI. Renders nothing when the child has no approved curriculum.
 */
export function UnitTitlePicker({ learnerId, choices, initialCodes = [], onTitle, maxLength }: {
  learnerId: string;
  choices: UnitChoice[];
  initialCodes?: string[];
  onTitle: (title: string) => void;
  maxLength: number;
}) {
  const [state, setState] = useState<PickerState>(() => stateFromCodes(choices, initialCodes));
  if (choices.length === 0) return null;
  return (
    <details className="rounded-xl border border-line px-3 py-2" data-testid="unit-title-picker">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{unitPickerCopy.compactOpen}</summary>
      <UnitPicker
        learnerId={learnerId}
        choices={choices}
        state={state}
        compact
        onChange={(next) => {
          setState(next);
          const t = autoTitle(choices, next).slice(0, maxLength);
          if (t) onTitle(t);
        }}
      />
    </details>
  );
}
