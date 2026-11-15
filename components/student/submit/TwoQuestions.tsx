"use client";

import { submitScreenCopy as copy } from "@/lib/copy/vi";
import type { TwoAnswers } from "@/lib/practice/twoQuestions";

function Seg({ label, value, options, onPick, testId }: { label: string; value: boolean | null; options: [boolean, string, string][]; onPick: (v: boolean) => void; testId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map(([v, text, id]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onPick(v)}
            data-testid={`${testId}-${id}`}
            className={`min-h-12 rounded-xl border px-5 text-base ${value === v ? "border-2 border-accent bg-[#e3ece8] font-semibold text-[#1d4136]" : "border-line bg-white text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Hai câu hỏi nhanh": nothing is chosen for the child, both must be answered. */
export function TwoQuestions({ value, onFirst, onHint }: { value: TwoAnswers; onFirst: (v: boolean) => void; onHint: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="two-questions">
      <Seg label={copy.firstQ} value={value.first} onPick={onFirst} testId="ask-first" options={[[true, copy.firstYes, "yes"], [false, copy.firstNo, "no"]]} />
      <Seg label={copy.hintQ} value={value.hint} onPick={onHint} testId="ask-hint" options={[[false, copy.hintNo, "no"], [true, copy.hintYes, "yes"]]} />
      <p className="text-sm text-muted">{copy.twoNote}</p>
    </div>
  );
}
