"use client";

import Link from "next/link";
import { useState } from "react";
import { resultCopy as c, retryCopy } from "@/lib/copy/vi";
import { playerCopy } from "@/lib/copy/vi";
import { groupResult, type ResultView as ResultData } from "@/lib/student/result";
import { RetryBox } from "./RetryBox";

/**
 * After submitting (S-10). Which questions to look at again: what the child wrote, never the right answer, an explanation, a count or a score.
 * Practice: one "Thử lại câu này" per question. Test: no retry; "{thầy/cô} sẽ chữa cùng bạn".
 */
export function ResultView({ activityId, title, result, canRedo, onRedo }: { activityId: string; title: string; result: ResultData; canRedo: boolean; onRedo: () => void }) {
  const g = groupResult(result);
  const [sent, setSent] = useState<Record<string, string>>({});
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" data-testid="result-view" data-test={result.isTest ? "yes" : "no"}>
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-6 text-center">
        <h1 role="status" className="text-2xl font-bold text-accent">
          {c.title}
        </h1>
        <p className="text-muted">{title}</p>
        <span className="rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">{result.isTest ? playerCopy.testTag : playerCopy.practiceTag}</span>
      </section>
      {result.isTest ? (
        <p className="rounded-xl bg-[#FBF1DC] px-4 py-3 text-[15px] text-[#6B4600]" data-testid="result-test-note">
          <b>{c.testNote}</b> {c.testNoteSub}
        </p>
      ) : null}

      {g.look.length > 0 ? (
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
                    <RetryBox activityId={activityId} itemId={x.id} number={x.n} onSent={(t) => setSent((s) => ({ ...s, [x.id]: t }))} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {g.open.length > 0 ? (
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

      {g.nothing ? (
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
