"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { messages, playerCopy as c, work } from "@/lib/copy/vi";
import {
  clampIndex, dots, initialSaveFlow, isLast, nextIndex, onEdit, onSaveDone, onSaveStart, prevIndex, progress, saveLabel, shouldSave, startIndex, unansweredIndexes, type SaveFlow,
} from "@/lib/student/player";
import { type ResultView as ResultData } from "@/lib/student/result";
import { questionNumber } from "@/lib/studio/view";
import { ASSISTANCE_VALUES, type Assistance, type DraftContent, type Receipt, type SupportedActivityView } from "@/lib/work/types";
import { baseRevisionOf, formatHm, nonEmptyAnswers } from "@/lib/work/view";
import { AskTutorSlot } from "./AskTutorSlot";
import { QuestionCard } from "./QuestionCard";
import { QuestionDots } from "./QuestionDots";
import { ResultView } from "./ResultView";

const AUTOSAVE_MS = 5000;
type Phase = "questions" | "review" | "receipt" | "result";

/**
 * Work in the app, one question at a time, with autosave. Keeps the S4 rules of WorkForm: one `client_submission_id` per open submit (the same one is re-sent
 * for the same content), the help declaration is required, the draft is the child's own. The reply is a receipt: nothing here says whether an answer was right.
 * A practice work shows the dimmed "Hỏi gia sư · Sắp có" slot; a test does not (and has no retry).
 */
export function Player({ activity, isTest, initialResult, aside }: { activity: SupportedActivityView; isTest: boolean; initialResult: ResultData | null; aside?: ReactNode }) {
  const { step, draft } = activity;
  const items = step.items;
  const initial: DraftContent = draft?.content ?? {};
  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers ?? {});
  const [idx, setIdx] = useState(() => startIndex(items, initial.answers ?? {}));
  const [phase, setPhase] = useState<Phase>(initialResult ? "result" : "questions");
  const [result, setResult] = useState<ResultData | null>(initialResult);
  const [pasted, setPasted] = useState(initial.pasted ?? false);
  const [pasteSeen, setPasteSeen] = useState(initial.pasted ?? false);
  const [assist, setAssist] = useState<Assistance[]>(initial.assistance ?? []);
  const [selfCheck, setSelfCheck] = useState<Record<number, boolean>>({});
  const [flow, setFlow] = useState<SaveFlow>(() => initialSaveFlow(!!draft));
  const [otherTab, setOtherTab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const flowRef = useRef(flow);
  const closed = useRef(false);
  const revision = useRef<number>(baseRevisionOf(draft));
  const pending = useRef<{ id: string; sig: string } | null>(null);
  const contentRef = useRef<DraftContent>({});
  useEffect(() => {
    flowRef.current = flow;
    contentRef.current = { answers: nonEmptyAnswers(answers), pasted, assistance: assist };
  });

  const total = items.length;
  const prog = progress(items, answers);
  const numbers = useMemo(() => items.map((it, i) => questionNumber(it.id, i)), [items]);
  const item = items[clampIndex(idx, total)];

  function touch(next: (s: SaveFlow) => SaveFlow = onEdit) {
    setProblem(null);
    setFlow((s) => next(s));
  }

  async function saveNow(): Promise<void> {
    if (closed.current || !shouldSave(flowRef.current)) return;
    const snapshot = contentRef.current;
    setFlow((s) => onSaveStart(s));
    flowRef.current = onSaveStart(flowRef.current);
    try {
      const res = await fetch(`/api/drafts/${activity.activityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: snapshot, base_revision: revision.current }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { draft: { revision: number; otherTabChanged: boolean } };
      revision.current = json.draft.revision;
      setOtherTab(json.draft.otherTabChanged);
      flowRef.current = onSaveDone(flowRef.current, true);
      setFlow((s) => onSaveDone(s, true));
    } catch {
      flowRef.current = onSaveDone(flowRef.current, false);
      setFlow((s) => onSaveDone(s, false));
    }
  }
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  });
  useEffect(() => {
    const t = setInterval(() => void saveRef.current(), AUTOSAVE_MS);
    return () => clearInterval(t);
  }, []);
  // a changed draft that is still unsaved asks the browser to keep the page open (also covers a closed tab)
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (flowRef.current.dirty && !closed.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function go(i: number) {
    setIdx(clampIndex(i, total));
    setPhase("questions");
    void saveRef.current();
  }

  function toggleHelp(value: Assistance, on: boolean) {
    touch();
    setAssist((prev) => {
      if (!on) return prev.filter((v) => v !== value);
      if (value === "none") return ["none"];
      return [...prev.filter((v) => v !== "none"), value];
    });
  }

  async function submit() {
    if (busy || receipt) return;
    if (Object.keys(nonEmptyAnswers(answers)).length === 0) return setProblem(work.needAnswer);
    if (assist.length === 0) return setProblem(work.needHelp);
    setBusy(true);
    setProblem(null);
    while (flowRef.current.inflight) await new Promise((r) => setTimeout(r, 50)); // a late autosave must not land after the submit
    const body = { activity_id: activity.activityId, content: { answers: nonEmptyAnswers(answers) }, assistance: assist, provenance: pasted ? "pasted" : "in_app" };
    const sig = JSON.stringify(body);
    if (!pending.current || pending.current.sig !== sig) pending.current = { id: crypto.randomUUID(), sig };
    try {
      const res = await fetch("/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, client_submission_id: pending.current.id }) });
      if (res.status === 409) {
        setProblem(work.submitConflict);
        pending.current = null;
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { receipt: Receipt };
      closed.current = true;
      pending.current = null;
      setReceipt(json.receipt);
      const r = await fetch(`/api/student/activities/${activity.activityId}/result`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((x: { result?: unknown } | null) => (x?.result ? (x.result as ResultData) : null))
        .catch(() => null);
      setResult(r);
      setPhase(r ? "result" : "receipt");
    } catch {
      setProblem(work.submitError);
    } finally {
      setBusy(false);
    }
  }

  function redo() {
    closed.current = false;
    revision.current = baseRevisionOf(null);
    pending.current = null;
    setAnswers({});
    setIdx(0);
    setReceipt(null);
    setResult(null);
    setProblem(null);
    setFlow(initialSaveFlow(false));
    setPhase("questions");
  }

  if (phase === "result" && result) {
    return <ResultView activityId={activity.activityId} title={activity.titleVi} result={result} canRedo={!isTest && activity.canSubmit} onRedo={redo} />;
  }
  if (phase === "receipt" && receipt) {
    return (
      <section aria-live="polite" data-testid="receipt" className="mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <h2 role="status" className="text-xl font-bold text-accent">
          {work.submittedAt(formatHm(receipt.submittedAt))}
        </h2>
        <p className="text-[15px]">{messages.submitted}</p>
        <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
          {work.homeLink}
        </Link>
      </section>
    );
  }

  const label = saveLabel(flow);
  const savedLine = label === "saving" ? c.saving : label === "error" ? c.notSaved : label === "saved" ? c.saved : "";
  const missing = unansweredIndexes(items, answers).map((i) => numbers[i]!);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3.5" data-testid="player" data-test={isTest ? "yes" : "no"} onPasteCapture={() => { setPasted(true); setPasteSeen(true); touch(); }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="flex min-h-11 items-center text-sm font-semibold text-accent">
          ‹ {c.exit}
        </Link>
        <span aria-live="polite" data-testid="save-status" className={`text-sm ${label === "error" ? "text-[#6B4600]" : "text-muted"}`}>
          {savedLine}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="work-kind" className="rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">
          {isTest ? c.testTag : c.practiceTag}
        </span>
        <h1 className="text-xl font-bold">{activity.titleVi}</h1>
      </div>
      <div className="flex items-center gap-3" aria-label={c.progressLabel}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5E8E1]" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${total ? (prog.answered / total) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-semibold" data-count="work" data-testid="player-progress">
          {c.progress(prog.answered, total)}
        </span>
      </div>
      <QuestionDots dots={dots(items, answers, idx)} numbers={numbers} onGo={go} />
      {isTest ? (
        <p role="note" data-testid="test-line" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm leading-snug text-[#6B4600]">
          <b>{c.testLineBold}</b>
          {c.testLineRest}
        </p>
      ) : null}
      {otherTab ? (
        <p role="status" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {work.otherTab}
        </p>
      ) : null}

      <div className={aside ? "flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6" : "flex flex-col gap-3.5"}>
        {aside ? <div className="lg:sticky lg:top-4">{aside}</div> : null}
        <div className="flex flex-col gap-3.5">
          {phase === "review" || !item ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" data-testid="player-review">
              <h2 className="text-lg font-bold">{c.beforeSubmit}</h2>
              <p className="text-[15px]" data-testid="player-missing">
                {missing.length > 0 ? c.missing(missing) : c.allAnswered}
              </p>
              {step.selfCheckVi.length > 0 ? (
                <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                  <legend className="mb-1 text-sm font-semibold text-muted">{work.selfCheckTitle}</legend>
                  {step.selfCheckVi.map((line, i) => (
                    <label key={i} className="flex min-h-11 items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={!!selfCheck[i]} onChange={(e) => setSelfCheck((s) => ({ ...s, [i]: e.target.checked }))} className="h-[22px] w-[22px] accent-[#2B5D4F]" />
                      {line}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <fieldset data-testid="help-declaration" className="m-0 flex flex-col gap-1 rounded-xl border border-line px-4 py-3">
                <legend className="px-1 text-sm font-semibold text-muted">{work.helpTitle}</legend>
                <p className="mb-1 text-[13px] leading-snug text-muted">{work.helpHint}</p>
                {ASSISTANCE_VALUES.map((v) => (
                  <label key={v} className="flex min-h-11 items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={assist.includes(v)} onChange={(e) => toggleHelp(v, e.target.checked)} className="h-[22px] w-[22px] accent-[#2B5D4F]" />
                    {work.help[v]}
                  </label>
                ))}
                <label className="flex min-h-11 items-center gap-2.5 border-t border-line pt-1 text-sm">
                  <input type="checkbox" checked={pasted} disabled={pasteSeen} onChange={(e) => { touch(); setPasted(e.target.checked); }} className="h-[22px] w-[22px] accent-[#2B5D4F]" />
                  {work.pastedLabel}
                </label>
                {pasted ? <p className="text-[13px] text-muted">{work.pastedNote}</p> : null}
              </fieldset>
              {problem ? (
                <p role="alert" data-testid="problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
                  {problem}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => go(items.length - 1)} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
                  {c.backToQuestions}
                </button>
                <button type="button" disabled={busy} onClick={() => void submit()} data-testid="player-submit" className="min-h-[52px] rounded-[14px] bg-accent px-6 text-base font-bold text-white disabled:opacity-60">
                  {busy ? work.submitting : c.submit}
                </button>
              </div>
            </section>
          ) : (
            <>
              <QuestionCard
                key={item.id}
                item={item}
                number={numbers[clampIndex(idx, total)]!}
                value={answers[item.id] ?? ""}
                onChange={(v) => {
                  touch();
                  setAnswers((a) => ({ ...a, [item.id]: v }));
                }}
              >
                {!isTest ? <AskTutorSlot /> : null}
              </QuestionCard>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" disabled={idx === 0} onClick={() => go(prevIndex(idx, total))} data-testid="player-prev" className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold disabled:opacity-40">
                  ‹ {c.prev}
                </button>
                {isLast(idx, total) ? (
                  <button type="button" onClick={() => { void saveRef.current(); setPhase("review"); }} data-testid="player-to-review" className="min-h-12 rounded-xl bg-accent px-5 text-base font-bold text-white">
                    {c.review}
                  </button>
                ) : (
                  <button type="button" onClick={() => go(nextIndex(idx, total))} data-testid="player-next" className="min-h-12 rounded-xl bg-[#E3ECE8] px-5 text-base font-bold text-[#1F4439]">
                    {c.next} ›
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { void saveRef.current(); setPhase("review"); }} data-testid="player-submit-top" className="min-h-11 self-start text-sm font-semibold text-accent underline">
                {c.review}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
