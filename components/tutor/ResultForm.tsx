"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { SkillMapView } from "@/lib/skillmap/types";
import { fallbackLabels, resultPage } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import { itemList, scoreFrame } from "@/lib/tutorwork/frameScore";
import { combineParts, dropPartTags, emptyPart, overall, pruneTags, rowFromStored, stripBreakdown, tagId, tagsForSave, titleWithPartsInfo, wrongTypedCount, type ItemTags, type PartRow } from "@/lib/tutorwork/partScore";
import { paperMode, startMode } from "@/lib/tutorwork/resultMode";
import { scaleBand } from "@/lib/frames/frame";
import { SubmissionPreview } from "@/components/practice/SubmissionPreview";
import type { AssignmentView } from "@/lib/practice/types";
import Link from "next/link";
import type { FrameView, ResultAttempt, ResultContext, ResultEdit, ResultMode, ResultSource, TagInfo } from "@/lib/tutorwork/types";
import { TagSelect } from "./TagSelect";
import { useTags } from "./useTags";

type Props = {
  learnerId: string;
  frames: FrameView[];
  tags: TagInfo[];
  /** The skill map of this learner (SM-1): the tag selects are grouped by domain. */
  map: SkillMapView;
  /** A parent cannot record work done in the session (D15). The database refuses it too. */
  canClass: boolean;
  today: string;
  minDate: string;
  /** Assignments given in the app that are still open (not retracted), so a result can be tied to one. */
  assignments?: AssignmentView[];
  /** From ?assignment= on the page (the "Ghi kết quả" link of the assignment list). */
  initialAssignmentId?: string | null;
  /** The live result of the chosen assignment: the form opens filled in, and what is saved REPLACES it ("Sửa kết quả"). */
  supersede?: ResultEdit | null;
  /** Record one more attempt of an assignment that already has a result (does not replace it): starts as "Làm lại". */
  initialRetry?: boolean;
  /** ?mode=frame: open the framed grid. Not linked from the screen any more; kept for old links and the e2e of frames. */
  initialFramed?: boolean;
};

/**
 * "Ghi điểm nhanh (bài link)": score by part (name, right, total, wrong numbers) + a tag per wrong item; the overall is added up. The
 * framed grid ("Đề có khung · bấm câu sai") is no longer offered here, but a result already recorded that way (or an assignment tied to a
 * frame) still opens in it. Only first attempts feed "Điểm cần chú ý"; the screen says so.
 */
export function ResultForm({ learnerId, frames, tags: initialTags, map, canClass, today, minDate, assignments = [], initialAssignmentId = null, supersede = null, initialRetry = false, initialFramed = false }: Props) {
  const router = useRouter();
  const { tags, add } = useTags(learnerId, initialTags);
  const labelOf = useMemo(() => new Map(tags.map((t) => [t.key, t.label])), [tags]);

  const initial = assignments.find((a) => a.id === initialAssignmentId) ?? null;
  const [assignmentId, setAssignmentId] = useState<string>(initial?.id ?? "");
  const chosen = assignments.find((a) => a.id === assignmentId) ?? null;
  const initialFrame = initial?.frameId && frames.some((f) => f.id === initial.frameId) ? initial.frameId : null;
  // "Sửa kết quả": every field starts as the recorded result had it; saving sends supersedes_id.
  const edit = supersede;
  const editFrame = edit?.mode === "frame" ? edit.frameId : null;

  const [mode, setMode] = useState<ResultMode>(
    startMode({ editMode: edit ? edit.mode : null, hasAssignment: initial !== null, assignmentHasFrame: initialFrame !== null, framedUrl: initialFramed, hasFrames: frames.length > 0 }),
  );
  const [frameId, setFrameId] = useState<string>(editFrame ?? initialFrame ?? frames[0]?.id ?? "");
  const [wrong, setWrong] = useState<Set<number>>(new Set(edit?.mode === "frame" ? edit.wrongItems : []));
  const [title, setTitle] = useState(edit && edit.mode === "quick" ? stripBreakdown(edit.title) : initial && !initialFrame ? initial.title : "");
  const [rows, setRows] = useState<PartRow[]>([edit && edit.mode === "quick" ? rowFromStored(edit.total, edit.correct, edit.wrongItems) : emptyPart()]);
  // Tags are kept by (part, item inside the part); a stored result opens as one part, so its global number is the item number.
  const [itemTags, setItemTags] = useState<ItemTags>(edit && edit.mode === "quick" ? Object.fromEntries(edit.itemTags.map((t) => [tagId(0, t.n), t.tagKey])) : {});
  const [source, setSource] = useState<ResultSource>(edit?.source ?? "practice");
  const [attempt, setAttempt] = useState<ResultAttempt>(edit ? edit.attempt : initialRetry ? "retry" : (initial?.submission?.attempt ?? "first"));
  const [usedHint, setUsedHint] = useState(edit ? edit.usedHint : (initial?.submission?.usedHint ?? false));
  const [context, setContext] = useState<ResultContext>(edit?.context ?? "home");
  const [date, setDate] = useState(edit?.takenOn ?? today);
  const [superseding, setSuperseding] = useState<string | null>(edit?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const { state: saveState, track } = useSaveStatus({ assignmentId, mode, frameId, wrong: [...wrong].sort(), title, rows, itemTags, source, attempt, usedHint, context, date }, { resetKey: round });
  const clientId = useRef<string>(crypto.randomUUID());

  const frame = frames.find((f) => f.id === frameId) ?? null;
  const score = frame ? scoreFrame(frame, wrong) : null;
  const band = frame && score ? scaleBand(frame.scale, score.correct) : null;

  const sum = overall(rows);
  const combined = combineParts(rows);
  const multi = rows.length > 1;
  const partName = (r: PartRow, i: number) => r.name.trim() || resultPage.partHeading(i + 1);
  /** Every change of the rows also drops the tags of items that no longer exist (a smaller total, a number no longer listed). */
  const changeRows = (next: (cur: PartRow[]) => PartRow[], removed: number | null = null) => {
    const after = next(rows);
    setRows(after);
    setItemTags((t) => pruneTags(removed === null ? t : dropPartTags(t, removed), after));
  };
  const setRow = (i: number, patch: Partial<PartRow>) => changeRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const titleInfo = titleWithPartsInfo(title, rows, resultPage.partHeading);
  /** The wrong items to tag, with the name shown for each (global numbers: that is what is stored). */
  const wrongEntries = combined.ok ? combined.entries : [];

  /** Pick an assignment (or none): fill in what the student already told us; the tutor can still change every field. */
  function pickAssignment(id: string) {
    setAssignmentId(id);
    const a = assignments.find((x) => x.id === id) ?? null;
    if (!a) {
      setMode(paperMode(initialFramed, frames.length > 0));
      return;
    }
    if (a.submission) {
      setAttempt(a.submission.attempt);
      setUsedHint(a.submission.usedHint ?? false); // null = a PDF, no Hint question: stays "no" unless the grown-up says otherwise
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
    setRound((n) => n + 1);
    setSuperseding(null);
    setAssignmentId("");
    setMode(paperMode(initialFramed, frames.length > 0));
    setWrong(new Set());
    setTitle("");
    setRows([emptyPart()]);
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
      ...(superseding ? { supersedes_id: superseding } : {}),
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
      if (!combined.ok) {
        const msg = { needTotal: resultPage.needTotal, needCorrect: resultPage.needCorrect, wrongInvalid: resultPage.wrongInvalid, wrongCountMismatch: resultPage.wrongCountMismatch, tooMany: resultPage.tooManyItems }[combined.error];
        return setError(multi ? resultPage.partError(partName(rows[combined.row]!, combined.row), msg) : msg);
      }
      payload = {
        ...common,
        mode: "quick",
        source,
        title: titleInfo.title,
        total_items: combined.total,
        correct: combined.correct,
        wrong_items: combined.wrong,
        tags: tagsForSave(combined.entries, itemTags),
      };
    }
    setBusy(true);
    const r = await track(() => postJson<{ id: string; untagged: number }>(`/api/learners/${learnerId}/results`, payload));
    setBusy(false);
    if (!r.ok) return setError(failText(r));
    setSaved(resultPage.saved(r.body.untagged));
    router.refresh();
  }

  const field = "min-h-11 rounded-lg border border-line bg-white px-3";
  const seg = (on: boolean) =>
    `min-h-11 rounded-lg border px-4 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;

  return (
    <form onSubmit={submit} onKeyDown={blockImplicitSubmit} className="flex flex-col gap-6" data-testid="result-form">
      {/* Once saved, the form is read-only until "Ghi bài khác": editing and saving again would record a second result. */}
      <fieldset disabled={saved !== null} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">{resultPage.source}</h2>
          {superseding ? (
            <div className="flex flex-col gap-1 rounded-lg bg-[#fbf0dc] p-3 text-sm" data-testid="supersede-notice">
              <b>{resultPage.supersedeTitle}</b>
              <span>{resultPage.supersedeNote}</span>
              {assignmentId ? (
                <Link href={`/learners/${learnerId}/results/new?assignment=${assignmentId}&again=1`} className="inline-flex min-h-11 items-center font-medium text-accent underline" data-testid="supersede-again">
                  {resultPage.supersedeAgain}
                </Link>
              ) : null}
            </div>
          ) : null}
          {assignments.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{resultPage.assignmentPick}</span>
              <select value={assignmentId} disabled={superseding !== null} onChange={(e) => pickAssignment(e.target.value)} data-testid="assignment-pick" className={field}>
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
            <div className="flex flex-col gap-3" data-testid="quick-parts">
              <h2 className="text-lg font-semibold">{resultPage.partsTitle}</h2>
              <p className="text-sm text-muted">{resultPage.partsHelp}</p>
              {rows.map((r, i) => {
                const sfx = i === 0 ? "" : `-${i + 1}`;
                const t = /^\d{1,3}$/.test(r.total) ? Number(r.total) : null;
                const c = /^\d{1,3}$/.test(r.correct) ? Number(r.correct) : null;
                const expected = t !== null && c !== null && c <= t ? t - c : null;
                const listed = wrongTypedCount(r.wrong, t);
                return (
                  <fieldset key={i} className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-3" data-testid={`quick-part${sfx}`}>
                    <legend className={multi ? "px-1 text-sm font-bold" : "sr-only"}>{resultPage.partHeading(i + 1)}</legend>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <span />
                      {multi ? (
                        <button type="button" aria-label={resultPage.removePart(i + 1)} onClick={() => changeRows((cur) => cur.filter((_, j) => j !== i), i)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm" data-testid={`quick-part-remove${sfx}`}>
                          ×
                        </button>
                      ) : null}
                    </div>
                    {multi ? (
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">{resultPage.partName}</span>
                        <input type="text" maxLength={40} value={r.name} placeholder={resultPage.partNameHint} onChange={(e) => setRow(i, { name: e.target.value })} data-testid={`quick-part-name${sfx}`} className={field} />
                      </label>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">{resultPage.quickCorrect}</span>
                        <input inputMode="numeric" value={r.correct} onChange={(e) => setRow(i, { correct: e.target.value.trim() })} data-testid={`quick-correct${sfx}`} className={field} />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">{resultPage.quickTotal}</span>
                        <input inputMode="numeric" value={r.total} onChange={(e) => setRow(i, { total: e.target.value.trim() })} data-testid={`quick-total${sfx}`} className={field} />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-muted">{resultPage.quickWrong}</span>
                      <input
                        type="text"
                        value={r.wrong}
                        placeholder={multi ? resultPage.partWrongHint : resultPage.quickWrongHint}
                        onChange={(e) => setRow(i, { wrong: e.target.value })}
                        data-testid={`quick-wrong${sfx}`}
                        className={field}
                      />
                      {expected !== null ? (
                        <span className="text-xs text-muted" aria-live="polite">
                          {resultPage.quickWrongCount(listed, expected)}
                        </span>
                      ) : null}
                    </label>
                  </fieldset>
                );
              })}
              <button type="button" onClick={() => changeRows((cur) => [...cur, emptyPart()])} className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent" data-testid="quick-part-add">
                {resultPage.addPart}
              </button>
              <p className="text-base font-bold" data-testid="quick-overall" aria-live="polite">
                {sum.total > 0 ? resultPage.overall(sum.correct, sum.total) : resultPage.overallEmpty}
              </p>
              {titleInfo.dropped ? (
                <p className="text-xs text-muted" role="status" data-testid="breakdown-dropped">
                  {resultPage.breakdownDropped}
                </p>
              ) : null}
            </div>

            {wrongEntries.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="quick-tags">
                <h2 className="text-lg font-semibold">{resultPage.tagEachTitle}</h2>
                <p className="text-sm text-muted">{resultPage.tagEachHelp}</p>
                {wrongEntries.map(({ n, part, local }) => (
                  <div key={n} className="grid grid-cols-[6.5rem_1fr] items-start gap-2">
                    <span className="pt-2.5 text-sm font-medium">{multi ? resultPage.tagItemPart(partName(rows[part]!, part), local) : resultPage.tagItem(n)}</span>
                    <TagSelect
                      tags={tags}
                      map={map}
                      value={itemTags[tagId(part, local)] ?? null}
                      onChange={(k) => setItemTags((cur) => ({ ...cur, [tagId(part, local)]: k }))}
                      onAdd={add}
                      label={`${resultPage.tagEachTitle}: ${multi ? resultPage.tagItemPart(partName(rows[part]!, part), local) : resultPage.tagItem(n)}`}
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || saved !== null}
          data-testid="result-save"
          className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? resultPage.saving : resultPage.save}
        </button>
        <SaveStatus state={saveState} />
      </div>
    </form>
  );
}
