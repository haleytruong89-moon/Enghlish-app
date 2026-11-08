"use client";

import { curriculumCopy } from "@/lib/copy/vi";
import type { TaughtUnit } from "@/lib/curriculum/schema";
import type { TaughtChoice } from "@/lib/curriculum/shape";
import { CURRICULUM_LIMITS } from "@/lib/curriculum/types";

/**
 * "Unit đã dạy hôm nay" on the session note (~1 phút, spec §3): per approved curriculum, the unit it is at and the next one as one-tap
 * chips, every other unit in a select. At most 6 in all.
 */
export function TaughtUnitsPicker({ choices, value, onChange, disabled }: { choices: TaughtChoice[]; value: TaughtUnit[]; onChange: (v: TaughtUnit[]) => void; disabled?: boolean }) {
  const max = CURRICULUM_LIMITS.taughtPerNote;
  const has = (c: string, u: string) => value.some((x) => x.curriculum_id === c && x.unit_code === u);
  const toggle = (c: string, u: string) =>
    onChange(has(c, u) ? value.filter((x) => !(x.curriculum_id === c && x.unit_code === u)) : value.length >= max ? value : [...value, { curriculum_id: c, unit_code: u }]);
  if (choices.length === 0) return <p className="text-sm text-muted" data-testid="taught-none">{curriculumCopy.taughtNone}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="taught-units">
      {choices.map((c) => {
        const at = c.units.findIndex((u) => u.code === c.currentCode);
        const quick = c.units.slice(Math.max(at, 0), Math.max(at, 0) + 2);
        const other = c.units.filter((u) => !quick.some((q) => q.code === u.code));
        return (
          <div key={c.curriculumId} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{c.title}</p>
            <div className="flex flex-wrap gap-2">
              {[...quick, ...other.filter((u) => has(c.curriculumId, u.code))].map((u) => {
                const on = has(c.curriculumId, u.code);
                return (
                  <button key={u.code} type="button" role="checkbox" aria-checked={on} disabled={disabled || (!on && value.length >= max)} onClick={() => toggle(c.curriculumId, u.code)}
                    data-testid={`taught-${c.curriculumId}-${u.code}`}
                    className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white hover:border-accent"}`}>
                    {on ? "✓ " : ""}
                    {u.code} · {u.title}
                  </button>
                );
              })}
              <select aria-label={`${c.title} · ${curriculumCopy.taughtOther}`} value="" disabled={disabled || value.length >= max} onChange={(e) => e.target.value && toggle(c.curriculumId, e.target.value)}
                data-testid={`taught-other-${c.curriculumId}`} className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm">
                <option value="">{curriculumCopy.taughtOther}</option>
                {other.filter((u) => !has(c.curriculumId, u.code)).map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} · {u.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
      {value.length >= max ? <p className="text-xs text-muted">{curriculumCopy.taughtMax(max)}</p> : null}
    </div>
  );
}
