// components/skills/ConditionList.tsx
import { skillStateCopy } from "@/lib/copy/vi";
import type { Condition } from "@/lib/engine/types";
import { conditionText } from "@/lib/skills/view";

/** Conditions of one level, ✓ / ✗ plus the word (never colour alone, UX §4.3). */
export function ConditionList({ conditions }: { conditions: Condition[] }) {
  if (conditions.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="condition-list">
      {conditions.map((c) => (
        <li key={c.id} data-testid={`condition-${c.id}`} data-met={c.met ? "true" : "false"}>
          <span aria-hidden="true" className={c.met ? "font-semibold text-accent" : "font-semibold text-[#7a2a0c]"}>
            {c.met ? skillStateCopy.met : skillStateCopy.notMet}
          </span>{" "}
          <span className="sr-only">{c.met ? skillStateCopy.metLabel : skillStateCopy.notMetLabel}: </span>
          {conditionText(c)}
        </li>
      ))}
    </ul>
  );
}
