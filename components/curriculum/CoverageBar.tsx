import { curriculumCopy } from "@/lib/copy/vi";

/** Coverage of one curriculum (adults only): a thin bar + "Đã học 11/25 Unit · 44 %". */
export function CoverageBar({ done, total, pct, testId }: { done: number; total: number; pct: number; testId: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={curriculumCopy.coverage(done, total, pct)} className="h-2 w-full max-w-md rounded-full bg-line">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm">{curriculumCopy.coverage(done, total, pct)}</p>
      <p className="text-xs text-muted">{curriculumCopy.coverageHint}</p>
    </div>
  );
}
