"use client";

import Link from "next/link";
import { useState } from "react";
import { linkSubmitCopy as link, sourceLabels, submitScreenCopy as copy } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";
import { missingParts, type TwoAnswers } from "@/lib/practice/twoQuestions";
import type { StudentPracticeItem } from "@/lib/practice/types";
import { formatHm } from "@/lib/work/view";
import { MissingRow } from "./MissingRow";
import { PageGrid } from "./PageGrid";
import { ReviewedPanel, SentPanel, Step } from "./SubmitShell";
import { TwoQuestions } from "./TwoQuestions";
import { usePages } from "./usePages";
import { useSendWork } from "./useSendWork";

/**
 * "Nộp bài link": open the exercise (new tab) → "Làm xong chưa?" (Chưa = it stays in Hôm nay) → photos / screenshots of the result page → two quick
 * questions → Nộp. The result pictures are pictures only (no PDF), up to 12.
 */
export function LinkSubmit({ item }: { item: StudentPracticeItem }) {
  const pagesApi = usePages({ allowPdf: false });
  const [opened, setOpened] = useState(false);
  const [finished, setFinished] = useState<"yes" | "no" | null>(null);
  const [answers, setAnswers] = useState<TwoAnswers>({ first: null, hint: null });
  const { send, busy, error, done } = useSendWork(item.assignmentId, pagesApi, answers);
  const due = item.dueOn ? formatDateVi(item.dueOn) : null;
  const href = safeExternalUrl(item.url);
  const site = item.sourceKey ? sourceLabels[item.sourceKey] : null;
  const missing = missingParts(pagesApi.pages.length, answers);
  const sentAt = item.submission ? `${formatDateVi(todayVn(new Date(item.submission.submittedAt)))} ${formatHm(item.submission.submittedAt)}` : null;
  // A child who sent before and comes back to send again has already done the exercise: no need to say "Xong rồi" again.
  const unlocked = finished === "yes" || item.submission !== null;

  if (item.reviewed) return <ReviewedPanel />;
  if (done) return <SentPanel />;
  const pill = (on: boolean) => `min-h-12 rounded-xl border px-5 text-base ${on ? "border-2 border-accent bg-[#e3ece8] font-semibold text-[#1d4136]" : "border-line bg-white text-ink"}`;
  return (
    <form onSubmit={send} className="flex flex-col gap-4" data-testid="link-submit" data-assignment={item.assignmentId}>
      <header>
        <span className="mb-2 inline-flex rounded-full bg-[#e3ece8] px-3 py-1 text-sm font-semibold text-[#1d4136]">{link.tag}</span>
        <h1 className="text-2xl font-bold">{item.title}</h1>
        <p className="mt-1 text-muted">
          {due ? (
            <>
              {link.dueLabel} <time dateTime={item.dueOn ?? undefined}>{due}</time>.{" "}
            </>
          ) : null}
          {link.where(site)}
        </p>
      </header>
      {item.submission ? (
        <p className="rounded-xl bg-[#fbf1dc] px-4 py-3 text-[#6b4600]" data-testid="link-resend-note">
          {copy.alreadySent(sentAt ?? "")}
        </p>
      ) : null}
      <ol className="flex list-none flex-col gap-3 p-0">
        <Step n={1} title={link.step1} state={opened || unlocked ? "done" : "active"}>
          <p className="text-sm text-muted">{link.step1Note}</p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
              data-testid="link-open"
              className="inline-flex min-h-12 items-center self-start rounded-xl bg-accent px-5 font-semibold text-white no-underline"
            >
              {opened ? link.openAgain : link.open}
            </a>
          ) : null}
        </Step>
        <Step n={2} title={link.step2} state={unlocked ? "done" : opened ? "active" : "later"}>
          <div role="radiogroup" aria-label={link.step2} className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={unlocked} onClick={() => setFinished("yes")} data-testid="link-finished-yes" className={pill(unlocked)}>
              {link.finishedYes}
            </button>
            <button type="button" role="radio" aria-checked={finished === "no"} onClick={() => setFinished("no")} data-testid="link-finished-no" className={pill(finished === "no")}>
              {link.finishedNo}
            </button>
          </div>
          {finished === "no" ? (
            <div className="flex flex-col gap-2" data-testid="link-not-yet">
              <p className="text-sm text-muted">{link.notYetNote}</p>
              <Link href="/" className="inline-flex min-h-12 items-center self-start rounded-xl border border-accent px-5 font-semibold text-accent no-underline" data-testid="link-back-today">
                {copy.backLabel}
              </Link>
            </div>
          ) : null}
        </Step>
        <Step n={3} title={link.step3} state={pagesApi.pages.length > 0 ? "done" : unlocked ? "active" : "later"}>
          {unlocked ? (
            <>
              <p className="text-sm text-muted">{link.step3Note}</p>
              <PageGrid
                pages={pagesApi.pages}
                busy={pagesApi.busy}
                notice={pagesApi.notice}
                unit="photo"
                allowPdf={false}
                onAdd={(f) => void pagesApi.add(f)}
                onMove={pagesApi.move}
                onTurn={pagesApi.turn}
                onRemove={pagesApi.remove}
                testPrefix="link"
              />
            </>
          ) : (
            <p className="text-sm text-muted" data-testid="link-locked">
              {link.step3Locked}
            </p>
          )}
        </Step>
        <Step n={4} title={link.step4} state={answers.first !== null && answers.hint !== null ? "done" : pagesApi.pages.length > 0 ? "active" : "later"}>
          <TwoQuestions value={answers} onFirst={(v) => setAnswers((a) => ({ ...a, first: v }))} onHint={(v) => setAnswers((a) => ({ ...a, hint: v }))} />
        </Step>
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="submit-error">
          {error}
        </p>
      ) : null}
      <MissingRow missing={missing} unit="photo" busy={busy} />
      <Link href="/" className="inline-flex min-h-11 items-center self-start text-sm text-accent underline">
        {copy.back}
      </Link>
    </form>
  );
}
