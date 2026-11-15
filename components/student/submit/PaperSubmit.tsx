"use client";

import Link from "next/link";
import { useState } from "react";
import { paperSubmitCopy as paper, submitScreenCopy as copy } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
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
 * "Nộp bài giấy" (PDF assignment): download the sheet → take the pages of the paper work (camera on an iPad, upload on a laptop; up to 12; move, turn,
 * delete) → two quick questions → Nộp. Pictures are shrunk and turned on this device; only the final pages are uploaded.
 */
export function PaperSubmit({ item, maxPages }: { item: StudentPracticeItem; maxPages?: number }) {
  const pagesApi = usePages({ allowPdf: true, maxPages });
  const [answers, setAnswers] = useState<TwoAnswers>({ first: null, hint: null });
  const [downloaded, setDownloaded] = useState(false);
  const { send, busy, error, done } = useSendWork(item.assignmentId, pagesApi, answers);
  const due = item.dueOn ? formatDateVi(item.dueOn) : null;
  const missing = missingParts(pagesApi.pages.length, answers);
  const sentAt = item.submission ? `${formatDateVi(todayVn(new Date(item.submission.submittedAt)))} ${formatHm(item.submission.submittedAt)}` : null;

  if (item.reviewed) return <ReviewedPanel />;
  if (done) return <SentPanel />;
  return (
    <form onSubmit={send} className="flex flex-col gap-4" data-testid="paper-submit" data-assignment={item.assignmentId}>
      <header>
        <span className="mb-2 inline-flex rounded-full bg-[#e3ece8] px-3 py-1 text-sm font-semibold text-[#1d4136]">{paper.tag}</span>
        <h1 className="text-2xl font-bold">{item.title}</h1>
        <p className="mt-1 text-muted">
          {due ? (
            <>
              {paper.dueLabel} <time dateTime={item.dueOn ?? undefined}>{due}</time>.{" "}
            </>
          ) : null}
          {paper.how}
        </p>
      </header>
      {item.submission ? (
        <p className="rounded-xl bg-[#fbf1dc] px-4 py-3 text-[#6b4600]" data-testid="paper-resend-note">
          {copy.alreadySent(sentAt ?? "")}
        </p>
      ) : null}
      <ol className="flex list-none flex-col gap-3 p-0">
        <Step n={1} title={paper.step1} state={downloaded ? "done" : "active"}>
          <p className="text-sm text-muted">{paper.step1Note}</p>
          {item.hasFile ? (
            <a
              href={`/api/student/practice/${item.assignmentId}/file`}
              onClick={() => setDownloaded(true)}
              data-testid="paper-download"
              className="inline-flex min-h-12 items-center self-start rounded-xl border border-accent bg-white px-5 font-semibold text-accent no-underline"
            >
              {downloaded ? paper.downloadAgain : paper.download}
            </a>
          ) : null}
        </Step>
        <Step n={2} title={paper.step2} state={pagesApi.pages.length > 0 ? "done" : "active"}>
          <p className="text-sm text-muted">{paper.step2Note}</p>
          <PageGrid
            pages={pagesApi.pages}
            busy={pagesApi.busy}
            notice={pagesApi.notice}
            unit="page"
            allowPdf
            onAdd={(f) => void pagesApi.add(f)}
            onMove={pagesApi.move}
            onTurn={pagesApi.turn}
            onRemove={pagesApi.remove}
            testPrefix="paper"
          />
        </Step>
        <Step n={3} title={paper.step3} state={answers.first !== null && answers.hint !== null ? "done" : pagesApi.pages.length > 0 ? "active" : "later"}>
          <TwoQuestions value={answers} onFirst={(v) => setAnswers((a) => ({ ...a, first: v }))} onHint={(v) => setAnswers((a) => ({ ...a, hint: v }))} />
        </Step>
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="submit-error">
          {error}
        </p>
      ) : null}
      <MissingRow missing={missing} unit="page" busy={busy} />
      <Link href="/" className="inline-flex min-h-11 items-center self-start text-sm text-accent underline">
        {copy.back}
      </Link>
    </form>
  );
}
