"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { finishCopy as c, reviewPage, studioFeedbackCopy, submissionFeedbackCopy } from "@/lib/copy/vi";
import { RESULT_RULES } from "@/lib/results/actions";
import { feedbackSuggestions, finishReady, isIssue, partTally, stateWith, tallyParts, type FinishItem, type FinishPart, type FinishState, type Verdict } from "@/lib/finish/view";
import { MAX_FEEDBACK_ITEM, MAX_FEEDBACK_PRAISE } from "@/lib/practice/schemas";
import type { SubmissionFeedbackView } from "@/lib/practice/types";
import { formatWhen } from "@/lib/review/format";
import { ratio, type Tally } from "@/lib/results/score";
import { clientIdBook } from "@/lib/roadmap/clientId";
import { sendJson } from "@/lib/studio/client";
import { studioErrorText } from "@/lib/studio/view";

const PILL: Record<string, { text: string; cls: string }> = {
  correct: { text: c.pills.correct, cls: "bg-[#e3f1e8] text-[#1f5a37]" },
  incorrect: { text: c.pills.incorrect, cls: "bg-[#fbe3de] text-[#8f2d1e]" },
  blank: { text: c.pills.blank, cls: "bg-[#fbe3de] text-[#8f2d1e]" },
  waiting: { text: c.pills.waiting, cls: "bg-[#fdebc8] text-[#6b4600]" },
  adultCorrect: { text: c.pills.adultCorrect, cls: "bg-[#e3f1e8] text-[#1f5a37]" },
  adultIncorrect: { text: c.pills.adultIncorrect, cls: "bg-[#fbe3de] text-[#8f2d1e]" },
  paper: { text: c.pills.paper, cls: "bg-paper text-muted" },
  unchecked: { text: c.pills.unchecked, cls: "bg-paper text-muted" },
};
const pillOf = (it: FinishItem, s: FinishState) =>
  PILL[s === "paper" || s === "waiting" || s === "blank" || s === "unchecked" ? s : it.byAdult || it.needsAdult ? (s === "correct" ? "adultCorrect" : "adultIncorrect") : s]!;
/** Never "0/0" (nothing decided yet: a dash). */
const score = (t: Tally) => (t.decided > 0 ? `${t.correct}/${t.decided}` : c.scoreEmpty);
// The thresholds the parent approved on 25/11 (shared with the "Việc nên làm" cards).
const LOW = RESULT_RULES.fixTogetherBelow;
const HIGH = RESULT_RULES.praiseFrom;
const tone = (t: Tally) => {
  const r = ratio(t);
  return r === null ? "text-[#6b4600]" : r < LOW ? "text-[#b4402c]" : r < HIGH ? "text-[#8a5a00]" : "text-[#2f7d4f]";
};
const word = (t: Tally) => {
  const r = ratio(t) ?? 0;
  return r < LOW ? c.scoreWord.low : r < HIGH ? c.scoreWord.mid : c.scoreWord.high;
};
const feedbackError = (code: string) => studioFeedbackCopy.errors[code] ?? submissionFeedbackCopy.errors[code] ?? c.errors.generic;

export type FinishWorkProps = {
  learnerId: string;
  attemptId: string;
  parts: FinishPart[];
  feedback: SubmissionFeedbackView | null;
  feedbackReady: boolean;
  /** false: the feedback lookup failed, sending could clash with feedback already there. */
  feedbackKnown?: boolean;
  viewerMemberId?: string;
  /** false: a repeat attempt (shown, never counted). */
  counted?: boolean;
  /** Set when a newer attempt exists: feedback goes there (this screen checks questions and retries only). */
  latestHref?: string | null;
  /** Skills still to score on the old review page. */
  skillsLeft?: number;
  retrySeenThrough: string | null;
  retryCount: number;
  /** The server says this submission needs nothing more (no question waiting, feedback given, retries seen). */
  done: boolean;
  next: { href: string; title: string } | null;
  backHref: string;
  oldPageHref: string;
};

/**
 * L1 · "Xong một bài": check the questions the app left to a person, read the wrong answers and the child's retries, write feedback
 * (app-made suggestions, no AI) and press "Xong bài". Calls the existing APIs only; the database checks who may do what.
 */
export function FinishWork(p: FinishWorkProps) {
  const router = useRouter();
  const latest = !p.latestHref;
  const counted = p.counted ?? true;
  const skillsLeft = p.skillsLeft ?? 0;
  // Feedback by another adult can only be edited by its author (the API says author_only): it counts as given, the form is read-only.
  const othersFeedback = !!p.feedback && !!p.viewerMemberId && p.feedback.authorMember !== p.viewerMemberId;
  const canWrite = latest && p.feedbackReady && (p.feedbackKnown ?? true) && !othersFeedback;
  // Steps already done in this visit: pressing Xong again after a partial failure does not redo them (no duplicate feedback).
  const sent = useRef<{ feedbackId: string | null }>({ feedbackId: null });
  const [local, setLocal] = useState<Record<string, Verdict>>({});
  const anyIssue = p.parts.some((pt) => pt.items.some((it) => isIssue(it)));
  const [only, setOnly] = useState(anyIssue);
  const [praise, setPraise] = useState(p.feedback?.praise ?? "");
  const [fixes, setFixes] = useState<string[]>(p.feedback?.items.map((i) => i.text) ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const books = useRef({ grade: clientIdBook(), feedback: clientIdBook(), retry: clientIdBook() });

  const total = tallyParts(p.parts, local);
  const all = p.parts.reduce((n, pt) => n + pt.items.length, 0);
  const needs = p.parts.flatMap((pt) => pt.items.filter((it) => it.needsAdult));
  const sugg = useMemo(() => feedbackSuggestions(p.parts, local), [p.parts, local]);
  const cleanFixes = fixes.map((f) => f.trim()).filter(Boolean);
  const hasFeedback = !latest || othersFeedback || praise.trim() !== "" || cleanFixes.length > 0;
  const changed = praise.trim() !== (p.feedback?.praise ?? "") || JSON.stringify(cleanFixes) !== JSON.stringify(p.feedback?.items.map((i) => i.text) ?? []);
  const ready = finishReady({ waiting: total.pending, hasFeedback });
  const blocked = busy || !ready.ready || (latest && !othersFeedback && !canWrite) || (p.done && !changed);
  const weakest = p.parts
    .map((pt) => ({ pt, t: partTally(pt, local) }))
    .filter((x) => x.t.decided > 0 && (ratio(x.t) ?? 1) < 1 && p.parts.length > 1)
    .sort((a, b) => (ratio(a.t) ?? 1) - (ratio(b.t) ?? 1))[0];

  async function saveGrades(): Promise<number | null> {
    const items = Object.entries(local).map(([item_id, result]) => ({ item_id, result }));
    if (items.length === 0) return total.pending;
    const body = { items };
    const r = await sendJson<{ pending: number }>(`/api/review/studio/attempts/${p.attemptId}`, "POST", { ...body, client_id: books.current.grade.idFor(body) });
    books.current.grade.settle(r);
    if (!r.ok) {
      setMsg({ ok: false, text: r.status === 0 ? c.errors.offline : studioErrorText(r.error) });
      return null;
    }
    return r.body.pending;
  }

  async function onSaveGrades() {
    setBusy(true);
    setMsg(null);
    const left = await saveGrades();
    setBusy(false);
    if (left === null) return;
    setMsg({ ok: true, text: c.gradesSaved(left) });
    setLocal({});
    router.refresh();
  }

  async function onFinish() {
    if (blocked) return;
    setBusy(true);
    setMsg(null);
    const left = await saveGrades();
    if (left === null) return setBusy(false);
    if (left > 0) {
      setBusy(false);
      return setMsg({ ok: false, text: c.errors.stillWaiting(left) });
    }
    if (canWrite && (changed || !p.feedback) && sent.current.feedbackId === null) {
      const supersedes = p.feedback?.id;
      const body = { ...(praise.trim() ? { praise: praise.trim() } : {}), items: cleanFixes.map((text) => ({ text })), ...(supersedes ? { supersedes_id: supersedes } : {}) };
      const r = await sendJson<{ id: string }>(`/api/learners/${p.learnerId}/studio/attempts/${p.attemptId}/feedback`, "POST", { ...body, client_id: books.current.feedback.idFor(body) });
      books.current.feedback.settle(r);
      if (!r.ok) {
        setBusy(false);
        return setMsg({ ok: false, text: r.status === 0 ? c.errors.offline : feedbackError(r.error) });
      }
      sent.current.feedbackId = r.body.id;
    }
    if (p.retrySeenThrough) {
      const body = { seen_through: p.retrySeenThrough };
      const r = await sendJson(`/api/review/studio/attempts/${p.attemptId}/retry-seen`, "POST", { ...body, client_id: books.current.retry.idFor(body) });
      books.current.retry.settle(r);
      if (!r.ok) {
        setBusy(false);
        // What was saved stays saved; show it (the feedback, the grades) before the adult presses again.
        router.refresh();
        return setMsg({ ok: false, text: r.status === 0 ? c.errors.offline : studioErrorText(r.error) });
      }
    }
    setBusy(false);
    setLocal({});
    router.refresh();
  }

  const box = "rounded-xl border border-line bg-white px-3 py-2 text-sm";
  return (
    <div className="flex flex-col gap-4" data-testid="finish-work">
      <ol className="grid grid-cols-2 gap-2 text-sm font-semibold md:grid-cols-4" aria-label={c.stepsLabel}>
        <li className={`rounded-xl px-3 py-2 ${total.pending > 0 ? "bg-[#fdebc8] text-[#6b4600]" : "bg-[#e3ece8] text-[#1f4439]"}`}>
          {needs.length > 0 ? c.steps.grade(Math.max(0, needs.length - needs.filter((it) => !local[it.id]).length), needs.length) : c.steps.gradeNone}
        </li>
        <li className="rounded-xl border border-line bg-white px-3 py-2">{c.steps.review}</li>
        <li className={`rounded-xl px-3 py-2 ${hasFeedback ? "bg-[#e3ece8] text-[#1f4439]" : "border border-line bg-white"}`}>{latest ? c.steps.feedback : c.steps.feedbackLatest}</li>
        <li className={`rounded-xl px-3 py-2 ${p.done ? "bg-accent text-white" : "border border-line bg-white"}`}>{c.steps.done}</li>
      </ol>

      {p.done ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#e3ece8] px-5 py-4 text-[#1f4439]" data-testid="finish-done">
          <div>
            <p className="text-lg font-bold">{counted ? c.doneTitle(score(total)) : c.doneTitleNotCounted(score(total))}</p>
            <p className="mt-1 text-sm">{!latest ? c.doneBodyNotLatest : skillsLeft > 0 ? c.doneBodySkills : c.doneBody}</p>
          </div>
          {p.next ? (
            <Link href={p.next.href} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white no-underline" data-testid="finish-next">
              {c.goNext(p.next.title)}
            </Link>
          ) : (
            <Link href={p.backHref} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white no-underline">{c.backWhenEmpty}</Link>
          )}
        </div>
      ) : null}

      {skillsLeft > 0 ? (
        <p className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e7c98f] bg-[#fdf3e0] px-4 py-3 text-sm" data-testid="finish-skills-left">
          <span>{c.skillsLeft(skillsLeft)}</span>
          <Link href={p.oldPageHref} className="inline-flex min-h-11 items-center rounded-xl border border-accent bg-white px-3 font-semibold text-accent no-underline">{c.skillsOpen}</Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3" aria-labelledby="finish-items">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="finish-items" className="text-lg font-bold">{c.itemsTitle}</h2>
            <div role="group" aria-label={c.filterLabel} className="flex gap-2">
              {[{ on: true, label: c.onlyIssues, id: "issues" }, { on: false, label: c.all(all), id: "all" }].map((f) => (
                <button key={f.id} type="button" aria-pressed={only === f.on} onClick={() => setOnly(f.on)} data-testid={`finish-filter-${f.id}`}
                  className={`min-h-11 rounded-full border border-accent px-4 text-sm font-semibold ${only === f.on ? "bg-accent text-white" : "bg-white text-accent"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {p.parts.map((pt) => {
            const t = partTally(pt, local);
            const rows = only ? pt.items.filter((it) => isIssue(it, local) || (it.needsAdult && local[it.id])) : pt.items;
            return (
              <section key={pt.key || "_"} className="overflow-hidden rounded-2xl border border-line bg-white" data-testid={`finish-part-${pt.key || "all"}`}>
                <div className="flex flex-wrap justify-between gap-2 border-b border-line bg-paper px-4 py-3">
                  <p className="font-bold">{pt.label}</p>
                  <p className={`text-sm font-semibold ${tone(t)}`}>{t.decided > 0 ? score(t) : ""}{t.pending > 0 ? `${t.decided > 0 ? " · " : ""}${c.pills.waiting} ${t.pending}` : ""}</p>
                </div>
                {rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{c.allRightHidden}</p> : null}
                {rows.map((it) => {
                  const s = stateWith(it, local);
                  const pill = pillOf(it, s);
                  return (
                    <div key={it.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0" data-testid={`finish-item-${it.id}`}>
                      <span className="w-7 text-sm font-bold text-muted">{it.n}</span>
                      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 text-sm">
                        <p lang="en" className="whitespace-pre-wrap">{it.stem}</p>
                        <p>
                          <span className="text-muted">{c.given}</span> <b lang="en">{it.given || c.blank}</b> ·{" "}
                          <span className="text-muted">{it.keyKind && it.keyKind !== "answer" ? `${reviewPage.keyKinds[it.keyKind]}:` : c.key}</span>{" "}
                          <span lang="en">{it.key ?? c.noKey}</span>
                        </p>
                        {it.retry ? (
                          <p className="text-[#2b5d4f]" data-testid={`finish-retry-${it.id}`}>{it.retry.revealed ? c.revealed : c.retried(it.retry.text ?? "")}</p>
                        ) : null}
                      </div>
                      {it.needsAdult ? (
                        <div role="group" aria-label={c.gradeGroup(it.n)} className="flex gap-2">
                          {(["correct", "incorrect"] as const).map((v) => (
                            <button key={v} type="button" aria-pressed={local[it.id] === v} disabled={busy} data-testid={`finish-${v}-${it.id}`}
                              onClick={() => setLocal((l) => ({ ...l, [it.id]: v }))}
                              className={`min-h-11 min-w-[72px] rounded-xl border text-sm font-semibold ${v === "correct" ? "border-[#2f7d4f]" : "border-[#b4402c]"} ${local[it.id] === v ? (v === "correct" ? "bg-[#2f7d4f] text-white" : "bg-[#b4402c] text-white") : v === "correct" ? "bg-white text-[#2f7d4f]" : "bg-white text-[#b4402c]"}`}>
                              {v === "correct" ? c.right : c.wrong}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.cls}`}>{pill.text}</span>
                    </div>
                  );
                })}
              </section>
            );
          })}
          <Link href={p.oldPageHref} className="text-sm text-accent underline">{c.oldPage}</Link>
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" aria-labelledby="finish-score" data-testid="finish-score">
            <h2 id="finish-score" className="text-base font-bold">{c.scoreTitle}</h2>
            <p className="text-3xl font-bold">
              {score(total)}{" "}
              {total.decided > 0 ? <span className={`text-base ${tone(total)}`}>{word(total)}</span> : null}
            </p>
            <p className="text-sm text-muted">{total.decided === 0 && total.pending === 0 ? c.scoreNone : total.pending > 0 ? c.scoreProvisional(total.pending) : counted ? c.scoreFinal : c.scoreFinalNotCounted}</p>
            {weakest ? <p className="text-sm">{c.weakest(weakest.pt.label, score(weakest.t))}</p> : null}
            <p className="text-xs text-muted">{c.childNote}</p>
          </section>

          {!latest ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="finish-not-latest">
              <h2 className="text-base font-bold">{c.notLatestTitle}</h2>
              <p className="text-sm text-muted">{c.notLatestBody}</p>
              <Link href={p.latestHref!} className="inline-flex min-h-11 items-center self-start rounded-xl border border-accent px-3 font-semibold text-accent no-underline">{c.openLatest}</Link>
            </section>
          ) : (
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" aria-labelledby="finish-fb" data-testid="finish-feedback">
            <h2 id="finish-fb" className="text-base font-bold">{c.feedbackTitle}</h2>
            <p className="text-sm text-muted">{c.feedbackIntro}</p>
            {!p.feedbackReady ? <p className="text-sm text-[#8f2d1e]">{studioFeedbackCopy.errors.feedback_unavailable}</p> : null}
            {p.feedbackKnown === false ? <p className="text-sm text-[#8f2d1e]" data-testid="finish-feedback-unknown">{c.feedbackUnknown}</p> : null}
            {p.feedback ? (
              <p className="rounded-lg bg-[#e3ece8] px-3 py-2 text-sm text-[#1f4439]" data-testid="finish-live-feedback">
                {(othersFeedback ? c.liveFeedbackOther : c.liveFeedback)(p.feedback.authorName ?? submissionFeedbackCopy.roles[p.feedback.authorRole] ?? submissionFeedbackCopy.roles.tutor!, formatWhen(p.feedback.createdAt))}
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {c.praiseLabel}
              <textarea rows={2} maxLength={MAX_FEEDBACK_PRAISE} value={praise} readOnly={!canWrite} onChange={(e) => setPraise(e.target.value)} className={`${box} font-normal`} data-testid="finish-praise" />
            </label>
            {canWrite && sugg.praise.length > 0 && praise.trim() === "" ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted">{c.suggestPraiseTitle}</p>
                <div className="flex flex-wrap gap-2">
                  {sugg.praise.map((s) => (
                    <button key={s} type="button" onClick={() => setPraise(s)} className="min-h-11 rounded-full border border-dashed border-accent bg-white px-3 text-left text-sm text-accent">+ {s}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{c.fixesLabel(cleanFixes.length)}</p>
              {fixes.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input aria-label={c.fixLabel(i + 1)} value={f} readOnly={!canWrite} maxLength={MAX_FEEDBACK_ITEM} onChange={(e) => setFixes((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} className={`${box} min-h-11 flex-1`} data-testid={`finish-fix-${i}`} />
                  <button type="button" aria-label={c.removeFix(i + 1)} disabled={!canWrite} onClick={() => setFixes((xs) => xs.filter((_, j) => j !== i))} className="min-h-11 min-w-11 rounded-xl text-lg text-[#8a3410]">×</button>
                </div>
              ))}
              {canWrite && fixes.length < 3 ? (
                <button type="button" onClick={() => setFixes((xs) => [...xs, ""])} className="min-h-11 self-start text-sm text-accent underline">{c.addFix}</button>
              ) : null}
              {canWrite && fixes.length < 3 && sugg.fixes.some((s) => !fixes.includes(s)) ? (
                <div className="flex flex-col gap-1" data-testid="finish-suggestions">
                  <p className="text-xs text-muted">{c.suggestTitle}</p>
                  <div className="flex flex-wrap gap-2">
                    {sugg.fixes.filter((s) => !fixes.includes(s)).map((s) => (
                      <button key={s} type="button" onClick={() => setFixes((xs) => (xs.length < 3 ? [...xs.filter((x) => x.trim()), s].slice(0, 3) : xs))}
                        className="min-h-11 rounded-full border border-dashed border-accent bg-white px-3 text-left text-sm text-accent">+ {s}</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl border-2 border-accent bg-white p-4" data-testid="finish-ready">
            <p className="text-sm font-bold">{c.readyTitle}</p>
            <ul className="list-disc pl-5 text-sm">
              <li className={total.pending > 0 ? "text-[#8a5a00]" : "text-[#2f7d4f]"}>{c.readyGrade(total.pending)}</li>
              <li className={hasFeedback ? "text-[#2f7d4f]" : "text-[#8a5a00]"}>{c.readyFeedback(hasFeedback)}</li>
            </ul>
            {p.retryCount > 0 ? <p className="text-xs text-muted">{c.retriesNote(p.retryCount)}</p> : null}
            <button type="button" disabled={blocked} onClick={() => void onFinish()} data-testid="finish-submit"
              className="min-h-12 rounded-xl bg-accent px-4 font-bold text-white disabled:bg-[#9aa49e]">
              {busy ? c.saving : ready.ready ? c.finish : c.finishBlocked}
            </button>
            {needs.length > 0 && Object.keys(local).length > 0 ? (
              <button type="button" disabled={busy} onClick={() => void onSaveGrades()} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm" data-testid="finish-save-grades">
                {c.saveGrades}
              </button>
            ) : null}
            {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-[#2f7d4f]" : "text-[#b4402c]"}`}>{msg.text}</p> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
