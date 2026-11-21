import { PartLeadBox } from "@/components/student/PartLeadBox";
import { rangeLabel } from "@/lib/studio/promptParts";
import { leadOf, type TaskPart } from "@/lib/studio/taskParts";

const numberOf = (id: string) => Number(/^q(\d+)$/.exec(id)?.[1] ?? NaN);

/** E0: the task box of a Studio test, one block per part with the questions it holds ("Questions 1–5") and its own lead only. */
export function TaskParts({ parts }: { parts: TaskPart[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="task-parts">
      {parts.map((p) => {
        const ns = p.items.map(numberOf).filter((n) => Number.isFinite(n));
        const lead = leadOf(p);
        return (
          <li key={p.key} className="flex flex-col gap-1" data-testid={`task-part-${p.key}`}>
            {ns.length > 0 ? <b lang="en" className="text-[14px]">{rangeLabel(Math.min(...ns), Math.max(...ns))}</b> : null}
            <PartLeadBox lead={lead} testId={`task-part-${p.key}-lead`} />
          </li>
        );
      })}
    </ul>
  );
}
