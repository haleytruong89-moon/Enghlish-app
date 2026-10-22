"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { feedbackCopy, revisionReviewCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import { revisionFailText } from "@/lib/revision/client";
import { checkFeedback, missingVerdicts } from "@/lib/revision/rules";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { CLOSING_MAX, verdictsFor, type RevisionView, type Verdict } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { postJson } from "@/lib/tutorwork/client";
import { DiffView } from "./DiffView";
import { emptyItem, FeedbackFields, feedbackPayloadItems, type FeedbackDraft } from "./FeedbackFields";
import { FeedbackItemsList } from "./FeedbackPanel";

/**
 * "Bài sửa lại (vòng n)" (spec §2 step 5): before–after with the word diff, the feedback, per item the child's choice and reason and a
 * REQUIRED verdict (two buttons that fit the choice), an optional closing note, then "Xong" or (round 1 only) "Mở vòng 2 với góp ý mới".
 * Verdicts and the action are saved in one call (D11). readOnly = the parent's / tutor's viewer under "Bài đã sửa".
 */
export function RevisionReview({ view, map, readOnly = false }: { view: RevisionView; map: SkillMapView | null; readOnly?: boolean }) {
  const router = useRouter();
  const canAct = view.canFinish && !readOnly;
  const [verdicts, setVerdicts] = useState<Record<number, Verdict | undefined>>({});
  const [closing, setClosing] = useState("");
  const [round2, setRound2] = useState<FeedbackDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());
  const left = missingVerdicts(view.feedback.items, verdicts);
  const markOf = (n: number) => view.marks.find((m) => m.n === n);
  const checkOf = (n: number) => view.checks.find((c) => c.n === n);

  async function finish(action: "close" | "round2") {
    if (left > 0) return setProblem(feedbackCopy.errors.checks_incomplete ?? null);
    if (action === "close" && hasScoreWords(closing)) return setProblem(feedbackCopy.errors.score_words ?? null);
    if (action === "round2") {
      const p = round2 ? checkFeedback(round2.praise, round2.items, view.after.text) : "praise_required";
      if (p) return setProblem(feedbackCopy.errors[p] ?? null);
    }
    setBusy(true);
    setProblem(null);
    const checks = view.feedback.items.map((it) => ({ n: it.n, verdict: verdicts[it.n] as Verdict }));
    const r = await postJson(
      `/api/review/attempts/${view.attemptId}/revision-finish`,
      action === "close"
        ? { action, client_id: clientId.current, checks, ...(closing.trim() ? { closing_note: closing.trim() } : {}) }
        : { action, client_id: clientId.current, checks, praise: round2!.praise.trim(), items: feedbackPayloadItems(round2!.items) },
    );
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) clientId.current = crypto.randomUUID();
      return setProblem(revisionFailText(r));
    }
    router.refresh();
  }

  return (
    <section aria-labelledby="revision-title" className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4" data-testid="revision-review">
      <h3 id="revision-title" className="text-base font-bold">
        {revisionReviewCopy.title(view.round)}
      </h3>
      <p className="text-sm text-muted">{revisionReviewCopy.intro}</p>
      <DiffView before={view.before.text} after={view.after.text} />

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{revisionReviewCopy.feedbackTitle}</h4>
        <p className="rounded-lg bg-[#E3ECE8] px-3 py-2 text-sm text-[#1F4439]">{view.feedback.praise}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {view.feedback.items.map((it) => {
          const mark = markOf(it.n);
          const done = checkOf(it.n);
          return (
            <li key={it.n} className="flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`revision-check-${it.n}`}>
              <FeedbackItemsList items={[it]} map={map} />
              {mark ? (
                <p className="text-sm">
                  <b>{revisionReviewCopy.childChose(mark.choice)}</b>
                  {" · "}
                  {mark.reason ? (
                    <>
                      {revisionReviewCopy.childReason}: <span lang="en">{mark.reason}</span>
                    </>
                  ) : (
                    revisionReviewCopy.noReason
                  )}
                </p>
              ) : null}
              {done ? (
                <p className="text-sm font-semibold">
                  {revisionReviewCopy.verdictLegend}: {revisionReviewCopy.verdicts[done.verdict]}
                </p>
              ) : canAct && mark ? (
                <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                  <legend className="mb-1 text-sm text-muted">{revisionReviewCopy.verdictLegend}</legend>
                  {verdictsFor(mark.choice).map((v) => (
                    <button key={v} type="button" aria-pressed={verdicts[it.n] === v} onClick={() => { setVerdicts((s) => ({ ...s, [it.n]: v })); setProblem(null); }}
                      data-testid={`verdict-${it.n}-${v}`}
                      className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${verdicts[it.n] === v ? "border-accent bg-accent text-white" : "border-line bg-white"}`}>
                      {revisionReviewCopy.verdicts[v]}
                    </button>
                  ))}
                </fieldset>
              ) : null}
            </li>
          );
        })}
      </ol>

      {view.closing || view.nextRound ? (
        <div className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2 text-sm" data-testid="revision-done">
          {view.closing ? (
            <>
              <p className="font-semibold">{revisionReviewCopy.done(formatWhen(view.closing.createdAt))}</p>
              {view.closing.note ? (
                <p>
                  {revisionReviewCopy.closingShown}: {view.closing.note}
                </p>
              ) : null}
            </>
          ) : view.nextRound ? (
            <p className="font-semibold">{revisionReviewCopy.round2Opened(formatWhen(view.nextRound.createdAt))}</p>
          ) : null}
        </div>
      ) : null}

      {canAct ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{revisionReviewCopy.scoringNote}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{revisionReviewCopy.closingLabel}</span>
            <span className="text-muted">{revisionReviewCopy.closingHint}</span>
            <textarea rows={2} maxLength={CLOSING_MAX} value={closing} onChange={(e) => { setClosing(e.target.value); setProblem(null); }}
              data-testid="revision-closing" className="min-h-11 rounded-lg border border-line bg-white px-3 py-2" />
          </label>
          {round2 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <h4 className="text-sm font-semibold">{revisionReviewCopy.round2Title}</h4>
              <FeedbackFields value={round2} onChange={(v) => { setRound2(v); setProblem(null); }} map={map} testIdPrefix="round2" />
            </div>
          ) : null}
          {problem ? (
            <p role="alert" data-testid="revision-review-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {round2 ? (
              <button type="button" disabled={busy || left > 0} onClick={() => finish("round2")} data-testid="revision-round2-send"
                className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:bg-[#C9CEC5] disabled:text-[#3F4541]">
                {busy ? revisionReviewCopy.saving : revisionReviewCopy.sendRound2}
              </button>
            ) : (
              <button type="button" disabled={busy || left > 0} onClick={() => finish("close")} data-testid="revision-finish"
                className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:bg-[#C9CEC5] disabled:text-[#3F4541]">
                {busy ? revisionReviewCopy.saving : revisionReviewCopy.finish}
              </button>
            )}
            {view.canOpenRound2 && !round2 ? (
              <button type="button" onClick={() => setRound2({ praise: "", items: [emptyItem()] })} data-testid="revision-round2-open"
                className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
                {revisionReviewCopy.openRound2}
              </button>
            ) : null}
            {left > 0 ? <span className="text-sm text-muted">{revisionReviewCopy.needVerdicts(left)}</span> : null}
          </div>
        </div>
      ) : !view.closing && !view.nextRound && !readOnly ? (
        <p className="text-sm text-muted">{revisionReviewCopy.readOnly}</p>
      ) : null}
    </section>
  );
}
