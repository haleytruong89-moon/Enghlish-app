// components/studio/SidePanel.tsx
import type { GateState } from "@/lib/ai/cap";
import { studioCopy } from "@/lib/copy/vi";
import type { DraftSummary } from "@/lib/studio/summary";
import { formatUsd } from "@/lib/studio/view";

/** "Bài sẽ tạo" (board 19). AI cost lines only when the server sent them (parent, spec §7). */
export function SidePanel({ summary, aiCostUsd, gate }: { summary: DraftSummary; aiCostUsd: number | null; gate: GateState | null }) {
  const row = (label: string, n: number, testId: string) => (
    <li className="flex justify-between gap-3" data-testid={testId}>
      <span>{label}</span>
      <span className="font-semibold">{studioCopy.side.items(n)}</span>
    </li>
  );
  return (
    <aside className="h-fit rounded-2xl border border-line bg-white p-4 lg:sticky lg:top-4" data-testid="studio-side">
      <h2 className="font-semibold">{studioCopy.side.title}</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {row(studioCopy.side.auto, summary.auto, "side-auto")}
        {row(studioCopy.side.mayNeedPerson, summary.mayNeedPerson, "side-person")}
        {row(studioCopy.side.counted, summary.counted, "side-counted")}
        {row(studioCopy.side.signalOnly, summary.signalOnly, "side-signal")}
        {row(studioCopy.side.paperFrame, summary.total, "side-frame")}
      </ul>
      {aiCostUsd !== null ? (
        <p className="mt-3 border-t border-line pt-3 text-sm" data-testid="side-ai-cost">
          {studioCopy.side.aiCost}: {formatUsd(aiCostUsd)}
          {gate ? <span className="block text-muted">{studioCopy.side.aiMonth(formatUsd(gate.spentUsd), formatUsd(gate.monthlyCapUsd))}</span> : null}
        </p>
      ) : null}
    </aside>
  );
}
