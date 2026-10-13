"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { messages, work } from "@/lib/copy/vi";
import { ASSISTANCE_VALUES, type SupportedActivityView, type Assistance, type DraftContent, type ItemView, type Receipt } from "@/lib/work/types";
import { baseRevisionOf, formatHm, nonEmptyAnswers, wordsOf } from "@/lib/work/view";

const AUTOSAVE_MS = 5000;

type SaveState = "idle" | "saving" | "saved" | "error";

const isChoice = (it: ItemView) => it.options.length > 0 && ["mcq", "gap", "word_form"].includes(it.kind);

/**
 * Questions or writing editor + help declaration + submit. Autosaves to the student's own draft every ~5 s and when a field
 * loses focus. A submit sends one `client_submission_id`; a retry of the SAME content re-sends the same id (so a lost
 * answer never creates a second attempt) and changed content gets a new id. The reply is a receipt: nothing here ever
 * shows whether an answer was right.
 */
export function WorkForm({ activity }: { activity: SupportedActivityView }) {
  const router = useRouter();
  const { shape, step, draft } = activity;
  const initial: DraftContent = draft?.content ?? {};

  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers ?? {});
  const [text, setText] = useState(initial.text ?? "");
  const [pasted, setPasted] = useState(initial.pasted ?? false);
  // once a paste was seen (here or in the saved draft) the box stays ticked: it cannot be undone by whoever pasted
  const [pasteSeen, setPasteSeen] = useState(initial.pasted ?? false);
  const [assist, setAssist] = useState<Assistance[]>(initial.assistance ?? []);
  const [selfCheck, setSelfCheck] = useState<Record<number, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(draft?.updatedAt ?? null);
  const [otherTab, setOtherTab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [attemptCount, setAttemptCount] = useState(activity.attempts.length);

  const dirty = useRef(false);
  const closed = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  // 0 = "this tab started with no draft": still a base, so a second tab that saved first is noticed (the server warns when it differs)
  const revision = useRef<number>(baseRevisionOf(draft));
  const pending = useRef<{ id: string; sig: string } | null>(null);

  const content = (): DraftContent =>
    shape === "text"
      ? { text, pasted, assistance: assist }
      : { answers: nonEmptyAnswers(answers), pasted, assistance: assist };
  const contentRef = useRef<DraftContent>(content());
  // refs are refreshed after each commit, never during render
  useEffect(() => {
    contentRef.current = content();
  });

  function touch() {
    dirty.current = true;
    setProblem(null);
  }

  async function saveNow(): Promise<void> {
    if (closed.current) return;
    if (inflight.current) await inflight.current;
    if (!dirty.current || closed.current) return;
    const snapshot = contentRef.current;
    dirty.current = false;
    const run = (async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/drafts/${activity.activityId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: snapshot, base_revision: revision.current }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { draft: { revision: number; savedAt: string; otherTabChanged: boolean } };
        revision.current = json.draft.revision;
        setSavedAt(json.draft.savedAt);
        setOtherTab(json.draft.otherTabChanged);
        setSaveState("saved");
      } catch {
        dirty.current = true; // try again on the next tick
        setSaveState("error");
      }
    })();
    inflight.current = run;
    await run;
    if (inflight.current === run) inflight.current = null;
  }

  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  });
  useEffect(() => {
    const timer = setInterval(() => void saveRef.current(), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  function toggleHelp(value: Assistance, on: boolean) {
    touch();
    setAssist((prev) => {
      if (!on) return prev.filter((v) => v !== value);
      if (value === "none") return ["none"];
      return [...prev.filter((v) => v !== "none"), value];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || receipt) return;
    const filled = shape === "text" ? text.trim() !== "" : Object.keys(nonEmptyAnswers(answers)).length > 0;
    if (!filled) return setProblem(shape === "text" ? work.needText : work.needAnswer);
    if (assist.length === 0) return setProblem(work.needHelp);
    setBusy(true);
    setProblem(null);
    if (inflight.current) await inflight.current; // a late autosave must not land after the submit
    const body = {
      activity_id: activity.activityId,
      content: shape === "text" ? { text } : { answers: nonEmptyAnswers(answers) },
      assistance: assist,
      provenance: pasted ? "pasted" : "in_app",
    };
    const sig = JSON.stringify(body);
    if (!pending.current || pending.current.sig !== sig) pending.current = { id: crypto.randomUUID(), sig };
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, client_submission_id: pending.current.id }),
      });
      if (res.status === 409) {
        setProblem(work.submitConflict);
        pending.current = null;
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { receipt: Receipt };
      closed.current = true;
      dirty.current = false;
      pending.current = null;
      setReceipt(json.receipt);
      setAttemptCount((n) => n + (json.receipt.replayed ? 0 : 1));
      // No router.refresh() here: for a one-time check the page would re-render without this form and the receipt would vanish
      // a moment after it appeared. The home page is dynamic (fetched fresh on navigation); a retry refreshes in again().
    } catch {
      setProblem(work.submitError);
    } finally {
      setBusy(false);
    }
  }

  function again() {
    closed.current = false;
    dirty.current = false;
    revision.current = baseRevisionOf(null);
    setReceipt(null);
    setProblem(null);
    setSaveState("idle");
    router.refresh(); // bring the list of earlier attempts up to date for the next try
  }

  if (receipt) {
    return (
      <section aria-live="polite" data-testid="receipt" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <h2 role="status" className="text-xl font-bold text-accent">
          {work.submittedAt(formatHm(receipt.submittedAt))}
        </h2>
        <p className="text-[15px]">{messages.submitted}</p>
        {activity.mode === "INDEPENDENT_CHECK" ? <p className="text-sm text-muted">{work.checkOnce}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-bold text-white">
            {work.homeLink}
          </Link>
          {activity.mode === "PRACTICE" ? (
            <button type="button" onClick={again} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
              {work.retry}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const last = activity.attempts[activity.attempts.length - 1];
  const savedLine =
    saveState === "saving"
      ? work.saving
      : saveState === "error"
        ? work.notSaved
        : savedAt
          ? work.savedAt(formatHm(savedAt))
          : "";

  return (
    <form
      onSubmit={submit}
      onBlur={() => void saveNow()}
      onPasteCapture={() => {
        setPasted(true);
        setPasteSeen(true);
        touch();
      }}
      className="flex flex-col gap-3.5"
      noValidate
    >
      {last && attemptCount > 0 ? (
        <p role="status" className="rounded-xl bg-[#E3ECE8] px-3.5 py-3 text-sm leading-snug text-[#1F4439]" data-testid="already-submitted">
          {work.alreadySubmitted(formatHm(last.submittedAt))} {work.mayRetry}
        </p>
      ) : null}

      {shape === "answers" ? (
        <section aria-labelledby="questions" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
          <h2 id="questions" className="text-sm font-semibold text-muted">
            {work.questionsTitle}
          </h2>
          {step.items.map((it, i) => (
            <fieldset key={it.id} data-testid={`question-${it.id}`} className="m-0 flex flex-col gap-1 border-0 p-0">
              <legend className="mb-1 text-[15px] font-semibold leading-snug">
                <span className="text-muted">{work.questionLabel(i + 1)}. </span>
                <span lang="en">{it.stem}</span>
              </legend>
              {isChoice(it) ? (
                it.options.map((o) => (
                  <label key={o} className="flex min-h-11 items-center gap-2.5 rounded-lg border border-line px-3 text-[15px] has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
                    <input
                      type="radio"
                      name={`q-${it.id}`}
                      value={o}
                      checked={answers[it.id] === o}
                      onChange={() => {
                        touch();
                        setAnswers((a) => ({ ...a, [it.id]: o }));
                      }}
                      className="h-5 w-5 accent-[#2B5D4F]"
                    />
                    <span lang="en">{o}</span>
                  </label>
                ))
              ) : it.kind === "open" || it.kind === "transform" ? (
                <textarea
                  aria-label={`${work.answerLabel} — ${work.questionLabel(i + 1)}`}
                  rows={it.kind === "open" ? 5 : 2}
                  value={answers[it.id] ?? ""}
                  placeholder={work.answerHint}
                  maxLength={it.kind === "open" ? 20000 : 2000}
                  lang="en"
                  onChange={(e) => {
                    touch();
                    setAnswers((a) => ({ ...a, [it.id]: e.target.value }));
                  }}
                  className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-[15px]"
                />
              ) : (
                <input
                  type="text"
                  aria-label={`${work.answerLabel} — ${work.questionLabel(i + 1)}`}
                  value={answers[it.id] ?? ""}
                  placeholder={work.answerHint}
                  maxLength={2000}
                  lang="en"
                  autoComplete="off"
                  autoCapitalize="none"
                  onChange={(e) => {
                    touch();
                    setAnswers((a) => ({ ...a, [it.id]: e.target.value }));
                  }}
                  className="min-h-11 rounded-lg border border-line bg-white px-3 text-[15px]"
                />
              )}
            </fieldset>
          ))}
        </section>
      ) : (
        <section aria-labelledby="write" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
          <h2 id="write" className="text-sm font-semibold text-muted">
            {work.writeTitle}
          </h2>
          <textarea
            aria-label={work.writeLabel}
            rows={9}
            value={text}
            placeholder={work.writeHint}
            maxLength={20000}
            lang="en"
            onChange={(e) => {
              touch();
              setText(e.target.value);
            }}
            className="min-h-40 rounded-lg border border-line bg-white px-3 py-2 text-base leading-relaxed"
          />
          <span className="text-[13px] text-muted" data-testid="word-count">
            {work.wordCount(wordsOf(text))}
          </span>
        </section>
      )}

      {step.selfCheckVi.length > 0 ? (
        <fieldset className="m-0 flex flex-col gap-1 rounded-2xl border border-line bg-white px-4 py-3">
          <legend className="px-1 text-sm font-semibold text-muted">{work.selfCheckTitle}</legend>
          {step.selfCheckVi.map((line, i) => (
            <label key={i} className="flex min-h-11 items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={!!selfCheck[i]}
                onChange={(e) => setSelfCheck((s) => ({ ...s, [i]: e.target.checked }))}
                className="h-[22px] w-[22px] accent-[#2B5D4F]"
              />
              {line}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset data-testid="help-declaration" className="m-0 flex flex-col gap-1 rounded-2xl border border-line bg-white px-4 py-3">
        <legend className="px-1 text-sm font-semibold text-muted">{work.helpTitle}</legend>
        <p className="mb-1 text-[13px] leading-snug text-muted">{work.helpHint}</p>
        {ASSISTANCE_VALUES.map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={assist.includes(v)}
              onChange={(e) => toggleHelp(v, e.target.checked)}
              className="h-[22px] w-[22px] accent-[#2B5D4F]"
            />
            {work.help[v]}
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-2.5 border-t border-line pt-1 text-sm">
          <input
            type="checkbox"
            checked={pasted}
            disabled={pasteSeen}
            onChange={(e) => {
              touch();
              setPasted(e.target.checked);
            }}
            className="h-[22px] w-[22px] accent-[#2B5D4F]"
          />
          {work.pastedLabel}
        </label>
        {pasted ? <p className="text-[13px] text-muted">{work.pastedNote}</p> : null}
      </fieldset>

      {problem ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="problem">
          {problem}
        </p>
      ) : null}
      {otherTab ? (
        <p role="status" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {work.otherTab}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[52px] rounded-[14px] bg-accent text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? work.submitting : attemptCount > 0 ? work.submitAgain : work.submit}
        </button>
        <span className="text-center text-xs text-muted" aria-live="polite" data-testid="save-status">
          {savedLine}
        </span>
      </div>
    </form>
  );
}
