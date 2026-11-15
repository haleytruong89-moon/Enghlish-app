"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { resultCopy as c, retryCopy, work } from "@/lib/copy/vi";
import { playerCopy } from "@/lib/copy/vi";
import { groupResult, type MarkKind, type ResultMark, type ResultView as ResultData } from "@/lib/student/result";
import { formatHm } from "@/lib/work/view";
import { RetryBox } from "./RetryBox";

const itemOf = (items: { id: string; kind: string; options: string[] }[], id: string) => items.find((i) => i.id === id);
const choicesOf = (items: { id: string; kind: string; options: string[] }[], id: string): string[] => {
  const it = itemOf(items, id);
  return it && it.options.length > 0 && ["mcq", "gap", "word_form"].includes(it.kind) ? it.options : [];
};
const isLong = (items: { id: string; kind: string; options: string[] }[], id: string): boolean => ["open", "transform"].includes(itemOf(items, id)?.kind ?? "");

/**
 * After submitting (S-10). Which questions to look at again: what the child wrote, never the right answer, an explanation, a count or a score.
 * Practice: one "Thử lại câu này" per question. Test: no retry; "{thầy/cô} sẽ chữa cùng bạn".
 */
export function ResultView({ activityId, title, result, items, canRedo, onRedo, onRefresh }: { activityId: string; title: string; result: ResultData; /** Re-reads the result after a retry / reveal (practice of a Studio set shows the answer from the server). */ onRefresh?: () => Promise<void> | void; /** The step items (kind and choices only; the key never reaches the browser). */ items: { id: string; kind: string; options: string[] }[]; canRedo: boolean; onRedo: () => void }) {
  const g = groupResult(result);
  const [sent, setSent] = useState<Record<string, string>>({});
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" data-testid="result-view" data-test={result.isTest ? "yes" : "no"}>
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-6 text-center">
        <h1 role="status" className="text-2xl font-bold text-accent">
          {c.title}
        </h1>
        <p className="text-muted">{title}</p>
        {/* Reopening a sent work must say so plainly: it was already sent, and there is no form here. */}
        <p data-testid="already-submitted" className="text-sm text-muted">
          {work.alreadySubmitted(formatHm(result.submittedAt))}
        </p>
        <span className="rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">{result.isTest ? playerCopy.testTag : playerCopy.practiceTag}</span>
      </section>
      {result.isTest ? (
        <p className="rounded-xl bg-[#FBF1DC] px-4 py-3 text-[15px] text-[#6B4600]" data-testid="result-test-note">
          <b>{c.testNote}</b> {c.testNoteSub}
        </p>
      ) : null}

      {result.marks ? (
        <section aria-labelledby="rs-marks" className="flex flex-col gap-3" data-testid="result-marks">
          <h2 id="rs-marks" className="text-lg font-bold">
            {c.marksTitle}
          </h2>
          <p className="text-sm text-muted">{c.marksIntro}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {result.marks.map((m) => (
              <MarkItem key={m.id} m={m} activityId={activityId} choices={choicesOf(items, m.id)} long={isLong(items, m.id)} onRefresh={onRefresh} />
            ))}
          </ul>
        </section>
      ) : null}

      {!result.marks && g.look.length > 0 ? (
        <section aria-labelledby="rs-look" className="flex flex-col gap-3">
          <h2 id="rs-look" className="text-lg font-bold">
            {result.isTest ? c.lookTitleTest : c.lookTitle}
          </h2>
          {g.retryAllowed ? <p className="text-sm text-muted">{c.lookIntro}</p> : null}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {g.look.map((x) => {
              const retryText = sent[x.id] ?? x.retryText;
              return (
                <li key={x.id} data-testid={`result-look-${x.id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                  <p className="text-sm font-semibold text-muted">{c.questionLabel(x.n)}</p>
                  <p lang="en" className="text-[16px] font-semibold">
                    {x.stem}
                  </p>
                  <p className="text-[15px]">
                    {x.given.trim() ? (
                      <>
                        <b>{c.youAnswered}:</b> <span lang="en">“{x.given}”</span>
                      </>
                    ) : (
                      c.notAnswered
                    )}
                  </p>
                  {retryText ? (
                    <div className="flex flex-col gap-1" data-testid={`retry-sent-${x.id}`}>
                      <p className="text-[15px]">
                        <b>{retryCopy.yourRetry}:</b> <span lang="en">“{retryText}”</span>
                      </p>
                      <span className="self-start rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">{retryCopy.sent}</span>
                    </div>
                  ) : g.retryAllowed && x.canRetry ? (
                    <RetryBox activityId={activityId} itemId={x.id} number={x.n} options={choicesOf(items, x.id)} long={isLong(items, x.id)} onSent={(t) => setSent((s) => ({ ...s, [x.id]: t }))} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!result.marks && g.open.length > 0 ? (
        <section aria-labelledby="rs-open" className="flex flex-col gap-3">
          <h2 id="rs-open" className="text-lg font-bold">
            {c.openTitle}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {g.open.map((x) => (
              <li key={x.id} data-testid={`result-open-${x.id}`} className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
                <p className="text-sm font-semibold text-muted">{c.questionLabel(x.n)}</p>
                <p lang="en" className="text-[16px] font-semibold">
                  {x.stem}
                </p>
                {x.given.trim() ? (
                  <p className="text-[15px]">
                    <b>{c.youWrote}:</b> <span lang="en">“{x.given}”</span>
                  </p>
                ) : null}
                <span className="self-start rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">{c.openNote}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.marks ? null : g.nothing ? (
        <p className="rounded-xl bg-[#E3ECE8] px-4 py-3 text-[15px] text-[#1F4439]" data-testid="result-nothing">
          {c.nothing}
        </p>
      ) : g.showOthersFine ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-[15px] font-semibold" data-testid="result-others-fine">
          {c.othersFine}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" data-testid="result-home" className="flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-bold text-white">
          {c.home}
        </Link>
        <Link href="/done" className="flex min-h-12 items-center rounded-xl border border-line bg-white px-5 text-base font-semibold">
          {c.done}
        </Link>
        {canRedo ? (
          <button type="button" data-testid="result-redo" onClick={onRedo} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
            {c.again}
          </button>
        ) : null}
      </div>
      <p className="text-center text-sm text-muted">{c.footnote}</p>
    </div>
  );
}

const TONE: Record<MarkKind, { box: string; chip: string }> = {
  right: { box: "border-[#2B6B47] bg-[#F3FAF6]", chip: "bg-[#DDF0E4] text-[#1B4D31]" },
  wrong: { box: "border-[#B3261E] bg-[#FFF6F4]", chip: "bg-[#FADBD6] text-[#8A1C12]" },
  waiting: { box: "border-[#B26A00] bg-[#FFFAF0]", chip: "bg-[#FBF1DC] text-[#6B4600]" },
};
const markText = (k: MarkKind) => (k === "right" ? c.markRight : k === "wrong" ? c.markWrong : c.markWaiting);
const retryText = (k: MarkKind) => (k === "right" ? c.retryRight : k === "wrong" ? c.retryWrong : c.retryWaiting);

/** One item of a practice work: colour + icon + words (never colour alone), the retry, and the answer only once the server sends it. */
function MarkItem({ m, activityId, choices, long, onRefresh }: { m: ResultMark; activityId: string; choices: string[]; long: boolean; onRefresh?: () => Promise<void> | void }) {
  const tone = TONE[m.mark];
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());
  async function reveal() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/student/activities/${activityId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: m.id, client_id: clientId.current }),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      await onRefresh?.();
    } catch {
      setProblem(c.revealFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li data-testid={`result-mark-${m.id}`} data-mark={m.mark} className={`flex flex-col gap-2 rounded-xl border-2 p-4 ${tone.box}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{c.questionLabel(m.n)}</p>
        <span data-testid={`mark-chip-${m.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${tone.chip}`}>
          {markText(m.mark)}
        </span>
      </div>
      <p lang="en" className="text-[16px] font-semibold">
        {m.stem}
      </p>
      <p className="text-[15px]">
        {m.given.trim() ? (
          <>
            <b>{c.youAnswered}:</b> <span lang="en">“{m.given}”</span>
          </>
        ) : (
          c.notAnswered
        )}
      </p>
      {m.retry ? (
        <div className="flex flex-col gap-1" data-testid={`retry-sent-${m.id}`}>
          <p className="text-[15px]">
            <b>{retryCopy.yourRetry}:</b> <span lang="en">“{m.retry.text}”</span>
          </p>
          <span data-testid={`retry-mark-${m.id}`} className={`self-start rounded-full px-3 py-1 text-sm font-bold ${TONE[m.retry.mark].chip}`}>
            {retryText(m.retry.mark)}
          </span>
        </div>
      ) : null}
      {m.canRetry || m.canReveal ? (
        <div className="flex flex-col gap-2">
          {m.canRetry ? (
            <RetryBox
              activityId={activityId}
              itemId={m.id}
              number={m.n}
              options={choices}
              long={long}
              onSent={() => void onRefresh?.()}
              extra={
                m.canReveal ? (
                  <button type="button" disabled={busy} onClick={() => void reveal()} data-testid={`reveal-${m.id}`} className="min-h-11 self-start rounded-xl border border-line bg-white px-4 text-sm font-semibold disabled:opacity-60">
                    {busy ? c.revealing : c.reveal}
                  </button>
                ) : null
              }
            />
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-[#6B4600]">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
      {m.answer ? (
        <p className="text-[15px]" data-testid={`answer-${m.id}`}>
          <b>{c.answerLabel}:</b> <span lang="en">{m.answer}</span>
        </p>
      ) : null}
      {m.why ? (
        m.mark === "right" ? (
          <details className="text-[15px]" data-testid={`why-${m.id}`}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">{c.whyLabel}</summary>
            <p>{m.why}</p>
          </details>
        ) : (
          <p className="text-[15px]" data-testid={`why-${m.id}`}>
            <b>{c.whyLabel}:</b> {m.why}
          </p>
        )
      ) : null}
    </li>
  );
}
