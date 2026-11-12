// components/skills/SkillRow.tsx
import { skillStateCopy, targetsPage } from "@/lib/copy/vi";
import { dayLabel } from "@/lib/levels/view";
import type { SkillStateRow } from "@/lib/skills/types";
import { missingForIndependent, stateLabel } from "@/lib/skills/view";
import { SkillCriteria } from "./SkillCriteria";
import { ManualForm } from "./ManualForm";
import { SkillScale } from "./SkillScale";

/** One tracked skill: name, group, the 4-cell scale, ⚑, the waiting proposal, "App tự cập nhật", the day; the child's tutor can set 1–2 by hand. */
export function SkillRow({ id, title, dimensionName, state, learnerId, canEdit, showCode, checks = [] }: {
  id: string; title: string; dimensionName: string; state: SkillStateRow | null; learnerId: string; canEdit: boolean; showCode: boolean; checks?: readonly string[];
}) {
  const current = state?.state ?? "NOT_OBSERVED";
  return (
    <li id={`skill-${id}`} data-testid={`skill-row-${id}`} className="scroll-mt-6 rounded-xl border border-line bg-white px-5 py-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">
        {targetsPage.dimension}: {dimensionName}
      </p>
      <SkillScale state={current} />
      <SkillCriteria checks={checks} missing={missingForIndependent({ state: current, conditions: state?.conditions ?? [] })} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {state?.flag ? (
          <span data-testid="skill-flag" className="rounded-full border border-[#B4690E] bg-[#FBF1DC] px-2 py-0.5 text-[#6B4600]">
            {skillStateCopy.flagChip}
          </span>
        ) : null}
        {state?.proposal ? (
          <span data-testid="skill-pending" className="rounded-full border border-accent px-2 py-0.5">
            {skillStateCopy.pending(stateLabel(state.proposal.toState))}
          </span>
        ) : null}
        {state?.auto ? (
          <span data-testid="skill-auto" className="text-muted">
            {skillStateCopy.autoNote}
          </span>
        ) : null}
        {state?.stateSince ? <span className="text-muted">{skillStateCopy.updatedOn(dayLabel(state.stateSince))}</span> : null}
      </div>
      {canEdit ? <ManualForm key={current} learnerId={learnerId} targetKey={id} current={current} /> : null}
      {showCode ? (
        <p className="mt-2 text-xs text-muted">
          {targetsPage.codeLabel}: {id}
        </p>
      ) : null}
    </li>
  );
}
