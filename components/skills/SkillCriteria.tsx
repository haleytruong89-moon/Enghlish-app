import { skillStateCopy } from "@/lib/copy/vi";
import { missingText } from "@/lib/skills/view";

/**
 * Staff only: what "Tự làm được" means for THIS skill (the catalogue's own checks, Vietnamese) and what is still missing, from the
 * conditions the engine already measured against the active policy. Renders nothing when there is neither.
 */
export function SkillCriteria({ checks, missing }: { checks: readonly string[]; missing: readonly string[] }) {
  const miss = missingText(missing);
  if (checks.length === 0 && miss === null) return null;
  return (
    <div className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm" data-testid="skill-criteria">
      {checks.length > 0 ? (
        <>
          <p className="font-medium">{skillStateCopy.criteriaIntro}</p>
          <ul className="mt-1 list-disc pl-5" data-testid="skill-criteria-list">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      ) : null}
      {miss ? (
        <p className="mt-2 text-muted" data-testid="skill-missing">
          {miss}
        </p>
      ) : null}
    </div>
  );
}
