"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { fallbackLabels, resultPage } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import { itemList, parseItemNumbers, scoreFrame } from "@/lib/tutorwork/frameScore";
import { scaleBand } from "@/lib/frames/frame";
import { SubmissionPreview } from "@/components/practice/SubmissionPreview";
import type { AssignmentView } from "@/lib/practice/types";
import type { FrameView, ResultAttempt, ResultContext, ResultMode, ResultSource, TagInfo } from "@/lib/tutorwork/types";
import { TagSelect } from "./TagSelect";
import { useTags } from "./useTags";

type Props = {
  learnerId: string;
  frames: FrameView[];
  tags: TagInfo[];
  /** A parent cannot record work done in the session (D15). The database refuses it too. */
  canClass: boolean;
  today: string;
  minDate: string;
  /** Assignments given in the app that are still open (not retracted), so a result can be tied to one. */
  assignments?: AssignmentView[];
  /** From ?assignment= on the page (the "Ghi kết quả" link of the assignment list). */
  initialAssignmentId?: string | null;
};

/**
 * "Ghi kết quả bài": two ways in one screen. "Đề có khung" = click the wrong items on a grid (tags come from the frame);
 * "Nhập nhanh" = score + wrong numbers + a tag per wrong item. Only first attempts feed "Điểm cần chú ý"; the screen says so.
 */
export function ResultForm({ learnerId, frames, tags: initialTags, canClass, today, minDate, assignments = [], initialAssignmentId = null }: Props) {
  const router = useRouter();
  const { tags, add } = useTags(learnerId, initialTags);
  const labelOf = useMemo(() => new Map(tags.map((t) => [t.key, t.label])), [tags]);

  const initial = assignments.find((a) => a.id === initialAssignmentId) ?? null;
  const [assignmentId, setAssignmentId] = useState<string>(initial?.id ?? "");
  const chosen = assignments.find((a) => a.id === assignmentId) ?? null;
  const initialFrame = initial?.frameId && frames.some((f) => f.id === initial.frameId) ? initial.frameId : null;

  const [mode, setMode] = useState<ResultMode>(initialFrame ? "frame" : initial ? "quick" : frames.length > 0 ? "frame" : "quick");
  const [frameId, setFrameId] = useState<string>(initialFrame ?? frames[0]?.id ?? "");
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState(initial && !initialFrame ? initial.title : "");
  const [total, setTotal] = useState("");
  const [correct, setCorrect] = useState("");
  const [wrongText, setWrongText] = useState("");
  const [itemTags, setItemTags] = useState<Record<number, string | null>>({});
  const [source, setSource] = useState<ResultSource>("practice");
  const [attempt, setAttempt] = useState<ResultAttempt>(initial?.submission?.attempt ?? "first");
  const [usedHint, setUsedHint] = useState(initial?.submission?.usedHint ?? false);
  const [context, setContext] = useState<ResultContext>("home");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  const frame = frames.find((f) => f.id === frameId) ?? null;
  const score = frame ? scoreFrame(frame, wrong) : null;
  const band = frame && score ? scaleBand(frame.scale, score.correct) : null;

  const totalN = /^\d{1,3}$/.test(total) ? Number(total) : null;
  const correctN = /^\d{1,3}$/.test(correct) ? Number(correct) : null;
  const wrongParsed = totalN ? parseItemNumbers(wrongText, totalN) : ({ ok: true, items: [] } as const);
  const quickWrong = wrongParsed.ok ? wrongParsed.items : [];
  const expectedWrong = totalN !== null && correctN !== null ? totalN - correctN : null;

  /** Pick an assignment (or none): fill in what the student already told us; the tutor can still change every field. */
  function pickAssignment(id: string) {
    setAssignmentId(id);
    const a = assignments.find((x) => x.id === id) ?? null;
    if (!a) return;
    if (a.submission) {
      setAttempt(a.submission.attempt);
      setUsedHint(a.submission.usedHint);
    }
    if (a.frameId && frames.some((f) => f.id === a.frameId)) {
      setMode("frame");
      setFrameId(a.frameId);
      setWrong(new Set());
    } else {
      setMode("quick");
      setTitle(a.title);
    }
  }

  function reset() {
    setAssignmentId("");
    setWrong(new Set());
    setTitle("");
    setTotal("");
    setCorrect("");
    setWrongText("");
    setItemTags({});
    setAttempt("first");
    setUsedHint(false);
    setSaved(null);
    setError(null);
    clientId.current = crypto.randomUUID();
  }

  function toggle(n: number) {
    setWrong((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    let payload: Record<string, unknown>;
    const common = {
      client_id: clientId.current,
      context,
      attempt,
      used_hint: usedHint,
      taken_on: date,
      ...(assignmentId ? { assignment_id: assignmentId } : {}),
    };
    if (mode === "frame") {
      if (!frame || !score) return setError(resultPage.needFrame);
      payload = {
        ...common,
        mode: "frame",
        frame_id: frame.id,
        wrong_items: score.wrong,
        tags: [],
      };
    } else {
      if (!title.trim()) return setError(resultPage.needTitle);
      if (totalN === null || totalN < 1 || totalN > 500) return setError(resultPage.needTotal);
      if (correctN === null || correctN > totalN) return setError(resultPage.needCorrect);
      if (!wrongParsed.ok) return setError(resultPage.wrongInvalid);
      if (quickWrong.length !== totalN - correctN) return setError(resultPage.wrongCountMismatch);
      payload = {
        ...common,
        mode: "quick",
        source,
        title: title.trim(),
        total_items: totalN,
        correct: correctN,
        wrong_items: quickWrong,
        tags: quickWrong.flatMap((n) => {
          const k = itemTags[n];
          return k ? [{ n, tag_key: k }] : [];
        }),
      };
    }
    setBusy(true);
    const r = await postJson<{ id: string; untagged: number }>(`/api/learners/${learnerId}/results`, payload);
    setBusy(false);
    if (!r.ok) return setError(failText(r));
    setSaved(resultPage.saved(r.body.untagged));
    router.refresh();
  }

  const field = "min-h-11 rounded-lg border border-line bg-white px-3";
  const seg = (on: boolean) =>
    `min-h-11 rounded-lg border px-4 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" data-testid="result-form">
      {/* Once saved, the form is read-only until "Ghi bài khác": editing and saving again would record a second result. */}
      <fieldset disabled={saved !== null} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">{resultPage.source}</h2>
          {assignments.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{resultPage.assignmentPick}</span>
              <select value={assignmentId} onChange={(e) => pickAssignment(e.target.value)} data-testid="assignment-pick" className={field}>
                <option value="">{resultPage.assignmentPaper}</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {resultPage.assignmentOption(a.title, a.submission !== null && a.resultId === null)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm">{resultPage.paperOnly}</p>
          )}
          <p className="text-xs text-muted">{resultPage.paperNote}</p>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">{resultPage.mode}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={resultPage.mode}>
            <button type="button" aria-pressed={mode === "frame"} data-testid="mode-frame" onClick={() => setMode("frame")} className={seg(mode === "frame")}>
              {resultPage.modeFrame}
            </button>
            <button type="button" aria-pressed={mode === "quick"} data-testid="mode-quick" onClick={() => setMode("quick")} className={seg(mode === "quick")}>
              {resultPage.modeQuick}
            </button>
          </div>
        </section>

        <div className={chosen?.submission ? "grid items-start gap-4 lg:grid-cols-2" : "flex flex-col gap-6"}>
          {chosen ? <SubmissionPreview assignment={chosen} /> : null}
        {mode === "frame" ? (
          frames.length === 0 || !frame || !score ? (
            <p className="rounded-xl border border-line bg-white p-4 text-sm" data-testid="no-frames">
              {resultPage.frameNone}
            </p>
          ) : (
            <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4" data-testid="frame-grid">
              {frames.length > 1 ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{resultPage.frame}</span>
                  <select
                    value={frameId}
                    onChange={(e) => {
                      setFrameId(e.target.value);
                      setWrong(new Set());
                    }}
                    className={field}
                  >
                    {frames.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm font-semibold">{frame.title}</p>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{resultPage.gridTitle}</h2>
                <button type="button" onClick={() => setWrong(new Set())} className="min-h-11 text-sm text-accent underline" data-testid="grid-clear">
                  {resultPage.gridClear}
                </button>
              </div>
              <p className="text-sm text-muted">{resultPage.gridHelp}</p>

              {score.parts.map((p) => (
                <div key={p.key} className="flex flex-col gap-2" data-testid={`part-${p.key}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{resultPage.partRange(p.name, p.from, p.to)}</span>
                    <span className="text-muted" data-testid={`part-score-${p.key}`}>
                      {resultPage.scoreOf(p.correct, p.total)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {frame.items
                      .filter((i) => i.part === p.key)
                      .map((i) => {
                        const on = wrong.has(i.n);
                        return (
                          <button
                            key={i.n}
                            type="button"
                            aria-pressed={on}
                            aria-label={on ? resultPage.itemWrong(i.n) : resultPage.itemRight(i.n)}
                            data-testid={`item-${i.n}`}
                            onClick={() => toggle(i.n)}
                            className={`size-11 rounded-lg border text-sm font-medium ${
                              on ? "border-red-700 bg-red-700 text-white" : "border-line bg-white text-ink hover:border-accent"
                            }`}
                          >
                            {i.n}
                            {on ? "✕" : ""}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}

              <div className="rounded-lg bg-paper p-3" data-testid="frame-summary">
                <p className="text-sm text-muted">{resultPage.scoreTitle}</p>
                <p className="text-2xl font-bold" data-testid="frame-score">
                  {resultPage.scoreOf(score.correct, score.total)}
                </p>
                {band ? (
                  <p className="text-sm" data-testid="frame-band">
                    {resultPage.scaleLine(band)}
                  </p>
                ) : null}
                <h3 className="mt-3 text-sm font-semibold">{resultPage.byTagTitle}</h3>
                {score.tags.length === 0 ? (
                  <p className="text-sm text-muted">{resultPage.noneWrong}</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="frame-tags">
                    {score.tags.map((t) => (
                      <li key={t.tagKey} className="flex flex-wrap justify-between gap-2">
                        <span>
                          {labelOf.get(t.tagKey) ?? fallbackLabels.tag} <span className="text-muted">· {resultPage.byTagLine(itemList(t.items))}</span>
                        </span>
                        <span className="font-semibold">{t.items.length}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )
        ) : (
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4" data-testid="quick-entry">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{resultPage.quickTitle}</span>
              <input
                type="text"
                maxLength={200}
                value={title}
                placeholder={resultPage.quickTitleHint}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="quick-title"
                className={field}
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm text-muted">{resultPage.kind}</legend>
              <div className="flex gap-2">
                <button type="button" aria-pressed={source === "test"} data-testid="source-test" onClick={() => setSource("test")} className={seg(source === "test")}>
                  {resultPage.kindTest}
                </button>
                <button type="button" aria-pressed={source === "practice"} data-testid="source-practice" onClick={() => setSource("practice")} className={seg(source === "practice")}>
                  {resultPage.kindPractice}
                </button>
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{resultPage.quickCorrect}</span>
                <input inputMode="numeric" value={correct} onChange={(e) => setCorrect(e.target.value.trim())} data-testid="quick-correct" className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">{resultPage.quickTotal}</span>
                <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.trim())} data-testid="quick-total" className={field} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{resultPage.quickWrong}</span>
              <input
                type="text"
                value={wrongText}
                placeholder={resultPage.quickWrongHint}
                onChange={(e) => setWrongText(e.target.value)}
                data-testid="quick-wrong"
                className={field}
              />
              {expectedWrong !== null && expectedWrong >= 0 ? (
                <span className="text-xs text-muted" aria-live="polite">
                  {resultPage.quickWrongCount(quickWrong.length, expectedWrong)}
                </span>
              ) : null}
            </label>

            {quickWrong.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="quick-tags">
                <h2 className="text-lg font-semibold">{resultPage.tagEachTitle}</h2>
                <p className="text-sm text-muted">{resultPage.tagEachHelp}</p>
                {quickWrong.map((n) => (
                  <div key={n} className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
                    <span className="pt-2.5 text-sm font-medium">{resultPage.tagItem(n)}</span>
                    <TagSelect
                      tags={tags}
                      value={itemTags[n] ?? null}
                      onChange={(k) => setItemTags((cur) => ({ ...cur, [n]: k }))}
                      onAdd={add}
                      label={`${resultPage.tagEachTitle}: ${resultPage.tagItem(n)}`}
                      testId={`quick-tag-${n}`}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )}
        </div>

        <section className="grid gap-4 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-muted">{resultPage.attempt}</legend>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={attempt === "first"}
                data-testid="attempt-first"
                onClick={() => setAttempt("first")}
                className={seg(attempt === "first")}
              >
                {resultPage.attemptFirst}
              </button>
              <button
                type="button"
                aria-pressed={attempt === "retry"}
                data-testid="attempt-retry"
                onClick={() => setAttempt("retry")}
                className={seg(attempt === "retry")}
              >
                {resultPage.attemptRetry}
              </button>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-muted">{resultPage.hint}</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={usedHint} data-testid="hint-yes" onClick={() => setUsedHint(true)} className={seg(usedHint)}>
                {resultPage.hintYes}
              </button>
              <button type="button" aria-pressed={!usedHint} data-testid="hint-no" onClick={() => setUsedHint(false)} className={seg(!usedHint)}>
                {resultPage.hintNo}
              </button>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-muted">{resultPage.context}</legend>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={context === "home"}
                data-testid="context-home"
                onClick={() => setContext("home")}
                className={seg(context === "home")}
              >
                {resultPage.contextHome}
              </button>
              {canClass ? (
                <button
                  type="button"
                  aria-pressed={context === "class"}
                  data-testid="context-class"
                  onClick={() => setContext("class")}
                  className={seg(context === "class")}
                >
                  {resultPage.contextClass}
                </button>
              ) : null}
            </div>
            {!canClass ? <p className="text-xs text-muted">{resultPage.contextClassTutorOnly}</p> : null}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{resultPage.date}</span>
            <input type="date" min={minDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} data-testid="result-date" className={field} />
          </label>
        </section>

        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">{resultPage.howCounted}</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted">
            {resultPage.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="result-error">
          {error}
        </p>
      ) : null}
      {saved ? (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm font-semibold text-accent" data-testid="result-saved">
          <span>{saved}</span>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-lg border border-accent bg-white px-4 font-semibold text-accent"
            data-testid="result-another"
          >
            {resultPage.saveAnother}
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || saved !== null}
          data-testid="result-save"
          className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? resultPage.saving : resultPage.save}
        </button>
      </div>
    </form>
  );
}
