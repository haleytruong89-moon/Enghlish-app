// components/skills/SkillScale.tsx
import { levelLabels, skillStateCopy } from "@/lib/copy/vi";
import { STATE_LEVEL, type SkillState } from "@/lib/engine/types";
import { scaleCells, stateLabel } from "@/lib/skills/view";

/** UX §3.2: the 4-cell scale with words (never colour alone); "Chưa đủ bài" fills no cell and says so. */
export function SkillScale({ state }: { state: SkillState }) {
  return (
    <div className="mt-2" data-testid="skill-scale" data-level={STATE_LEVEL[state]}>
      <ol className="grid grid-cols-4 gap-1" aria-label={skillStateCopy.scaleLabel(stateLabel(state))}>
        {scaleCells(state).map((cell) => (
          <li
            key={cell.state}
            aria-current={cell.current ? "step" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md border px-1 text-center text-[11px] leading-tight ${
              cell.filled ? "border-accent bg-[#E3ECE8] font-semibold text-ink" : "border-dashed border-line text-muted"
            }`}
          >
            {cell.label}
          </li>
        ))}
      </ol>
      {STATE_LEVEL[state] === 0 ? <p className="mt-1 text-xs text-muted">{levelLabels.NOT_OBSERVED.label}</p> : null}
    </div>
  );
}
