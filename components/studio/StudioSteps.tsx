import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { aiGuideCopy } from "@/lib/copy/vi";

export type StudioStage = "upload" | "extracting" | "draft" | "failed" | "approved" | "assigned";
const STEP: Record<StudioStage, 1 | 2 | 3 | 4> = { upload: 1, extracting: 2, draft: 2, failed: 2, approved: 3, assigned: 4 };

/**
 * 27/11: "① Tải đề + đáp án → ② Duyệt nháp → ③ Giao" on Tạo bài từ đề and on the draft page, the step being done in bold, one line of
 * what to do now, and the link to the page "Hướng dẫn dùng AI" (a GuardedLink: the draft editor may have unsaved edits).
 */
export function StudioSteps({ stage, learnerId, aside }: { stage: StudioStage; learnerId: string; aside?: React.ReactNode }) {
  const c = aiGuideCopy.bar;
  const now = STEP[stage];
  return (
    <section aria-label={c.label} data-testid="studio-steps" data-stage={stage} className="mt-4 rounded-2xl border border-line bg-white p-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {c.names.map((name, k) => {
          const n = k + 1;
          const state = n < now ? "done" : n === now ? "now" : "later";
          return (
            <li key={name} className="flex items-center gap-2" data-testid={`studio-step-${n}`} data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${state === "done" ? "bg-accent text-white" : state === "now" ? "border-2 border-accent bg-[#eef5f1] text-accent" : "border border-line text-muted"}`}>
                {state === "done" ? "✓" : n}
              </span>
              <span className={state === "now" ? "font-bold text-[#1f4439]" : "text-muted"}>
                {name}
                {state === "later" ? null : <span className="sr-only"> ({state === "done" ? c.done : c.now})</span>}
              </span>
              {n < 3 ? <span aria-hidden="true" className="px-1 text-muted">→</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm" data-testid="studio-step-line">{c[stage]}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href={`/learners/${learnerId}/help/ai`} data-testid="ai-guide-link" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">
          {aiGuideCopy.guideLink}
        </Link>
        {aside}
      </div>
    </section>
  );
}
