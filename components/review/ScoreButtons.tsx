"use client";

import { scoreLabels } from "@/lib/copy/vi";

export type Choice = 0 | 1 | 2 | 3 | 4 | "na";

const CHOICES: { v: Choice; key: "0" | "1" | "2" | "3" | "4" | "null" }[] = [
  { v: 0, key: "0" },
  { v: 1, key: "1" },
  { v: 2, key: "2" },
  { v: 3, key: "3" },
  { v: 4, key: "4" },
  { v: "na", key: "null" },
];

/**
 * Six buttons: 0..4 with their words (UX guide §3.1 - never a bare number) and "no opportunity" (NULL, not 0).
 * Selection is shown by fill AND by the pressed state, not by colour alone.
 */
export function ScoreButtons({
  label,
  testKey,
  value,
  onChange,
}: {
  label: string;
  testKey: string;
  value: Choice | undefined;
  onChange: (v: Choice) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {CHOICES.map(({ v, key }) => {
        const selected = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            aria-pressed={selected}
            title={scoreLabels[key].tooltip}
            data-testid={`score-${testKey}-${v}`}
            onClick={() => onChange(v)}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1 text-center ${
              selected ? "border-2 border-accent bg-accent text-white" : "border-line bg-white hover:border-accent"
            }`}
          >
            <span className="text-lg font-bold">{v === "na" ? "—" : v}</span>
            <span className="text-[11px] leading-tight">{scoreLabels[key].short}</span>
          </button>
        );
      })}
    </div>
  );
}

export const choiceToScore = (c: Choice): { score: number | null; not_observed: boolean } =>
  c === "na" ? { score: null, not_observed: true } : { score: c, not_observed: false };
