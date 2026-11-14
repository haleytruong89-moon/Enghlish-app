"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { curriculumCopy, fallbackLabels, sessionKindCopy, sessionNotePage } from "@/lib/copy/vi";
import { sessionFailText } from "@/lib/sessions/client";
import { formatDateVi } from "@/lib/inquiries/format";
import { firstTab, groupTargets } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import { postJson } from "@/lib/tutorwork/client";
import {
  MAX_PRACTISED_PER_NOTE,
  MAX_WEAK_TAGS_PER_NOTE,
  MESSAGE_MAX,
  PARENT_NOTE_MAX,
  RECHECK_RESULTS,
  STUDIED_MAX,
  type LastNote,
  type RecheckResult,
  type TagInfo,
  type WeakPoint,
} from "@/lib/tutorwork/types";
import { placeOfTag } from "@/lib/skillmap/group";
import { applySameAsLast } from "@/lib/tutorwork/sameAsLast";
import { TaughtUnitsPicker } from "@/components/curriculum/TaughtUnitsPicker";
import { UnitProposal } from "@/components/curriculum/UnitProposal";
import type { TaughtUnit } from "@/lib/curriculum/schema";
import type { TaughtChoice } from "@/lib/curriculum/shape";
import { DomainTabs } from "./DomainTabs";
import { PractisedChosen } from "./PractisedChosen";
import { TagChips } from "./TagChips";
import { useTags } from "./useTags";

/**
 * "Ghi buổi học" (v2): date, what was studied, up to 3 tags to reinforce, a message the student can read, a note only the parent
 * sees, and the answer to "did you ask again?" for every tag that is due for a re-check. Saved as one shared note.
 */
export function SessionNoteForm({
  learnerId,
  tags: initialTags,
  skills,
  due,
  previous,
  today,
  minDate,
  map,
  taughtChoices = [],
  makeupChoices = [],
}: {
  learnerId: string;
  tags: TagInfo[];
  /** Skills of the learner's current target set (id + title from the catalogue): the "practised today" chips. */
  skills: { id: string; title: string }[];
  due: WeakPoint[];
  previous: LastNote | null;
  today: string;
  minDate: string;
  /** The skill map of this learner (SM-1): skills and tags are picked by domain. */
  map: SkillMapView;
  /** W2: approved curricula of the child for "Unit đã dạy hôm nay" (empty before 0026 or when none is approved). */
  taughtChoices?: TaughtChoice[];
  /** 3B: live absences with no makeup yet ("Bù cho buổi nghỉ ngày …"); empty when there are none or before 0030. */
  makeupChoices?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { tags, add, setGroup } = useTags(learnerId, initialTags);
  const [date, setDate] = useState(today);
  const [studied, setStudied] = useState("");
  const [weak, setWeak] = useState<string[]>([]);
  const [practised, setPractised] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [parentNote, setParentNote] = useState("");
  const [rechecks, setRechecks] = useState<Record<string, RecheckResult | null>>({});
  const [error, setError] = useState<string | null>(null);
  const skillBuckets = useMemo(() => groupTargets(map, skills), [map, skills]);
  const [skillTab, setSkillTab] = useState<string>(() => firstTab(skillBuckets));
  const [saved, setSaved] = useState(false);
  const [taught, setTaught] = useState<TaughtUnit[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [sameNote, setSameNote] = useState<{ practised: string; weak: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"regular" | "makeup">("regular");
  const [makeupFor, setMakeupFor] = useState("");
  const { state: saveState, track } = useSaveStatus({ date, studied, weak, practised, message, parentNote, rechecks, taught, kind, makeupFor });
  const clientId = useRef<string>(crypto.randomUUID());
  const labelOf = new Map(tags.map((t) => [t.key, t.label]));

  const sameResult = useMemo(() => {
    if (!previous) return null;
    const hidden = tags.filter((t) => placeOfTag(map, t)?.hidden).map((t) => t.key);
    return applySameAsLast(previous, { practised, weak }, skills.map((x) => x.id), tags.map((t) => t.key), hidden);
  }, [previous, practised, weak, skills, tags, map]);
  const canAddFromPrevious = !!sameResult && sameResult.addedSkills + sameResult.addedWeak > 0;
  function fillFromPrevious() {
    if (!sameResult || !canAddFromPrevious) return;
    const skipped = sameResult.skippedSkills + sameResult.skippedWeak;
    setPractised(sameResult.practised);
    setWeak(sameResult.weak);
    setSameNote({
      practised: sameResult.practised.join("\u0000"),
      weak: sameResult.weak.join("\u0000"),
      text: `${sessionNotePage.sameAsLastDone(sameResult.addedSkills, sameResult.addedWeak)}${skipped > 0 ? ` ${sessionNotePage.sameAsLastSkipped(skipped)}` : ""}`,
    });
  }
  // The status line only stays while the picks are exactly what the button produced.
  const sameNoteText = sameNote && sameNote.practised === practised.join("\u0000") && sameNote.weak === weak.join("\u0000") ? sameNote.text : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const answered = Object.entries(rechecks).flatMap(([tag_key, result]) => (result ? [{ tag_key, result }] : []));
    if (!studied.trim() && weak.length === 0 && practised.length === 0 && !message.trim() && !parentNote.trim() && answered.length === 0 && taught.length === 0) return setError(sessionNotePage.empty);
    if (answered.some((a) => a.result === "ok" && weak.includes(a.tag_key))) return setError(sessionNotePage.recheckConflict);
    setBusy(true);
    const r = await track(() => postJson<{ id: string }>(`/api/learners/${learnerId}/session-notes`, {
      client_id: clientId.current,
      session_date: date,
      ...(studied.trim() ? { studied: studied.trim() } : {}),
      weak_tags: weak,
      practised_target_ids: practised,
      ...(message.trim() ? { message: message.trim() } : {}),
      ...(parentNote.trim() ? { note_for_parent: parentNote.trim() } : {}),
      rechecks: answered,
      ...(taught.length > 0 ? { taught_units: taught } : {}),
      ...(kind === "makeup" ? { session_kind: "makeup", ...(makeupFor ? { makeup_for: makeupFor } : {}) } : {}),
    }));
    setBusy(false);
    if (!r.ok) return setError(sessionFailText(r));
    setSavedId(r.body.id);
    setSaved(true);
    router.refresh();
  }

  const field = "rounded-lg border border-line bg-white px-3";
  const seg = (on: boolean) =>
    `min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;

  return (
    <form onSubmit={submit} onKeyDown={blockImplicitSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="session-form">
      <fieldset disabled={saved} className="m-0 flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-white p-4">
        {canAddFromPrevious || sameNoteText ? (
          <div className="flex flex-col gap-1">
            {canAddFromPrevious ? (
              <>
                <button
                  type="button"
                  onClick={fillFromPrevious}
                  data-testid="session-same-as-last"
                  className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent"
                >
                  {sessionNotePage.sameAsLast}
                </button>
                <p className="text-xs text-muted">{sessionNotePage.sameAsLastHelp}</p>
              </>
            ) : null}
            {sameNoteText ? (
              <p role="status" className="text-sm text-accent" data-testid="session-same-as-last-note">
                {sameNoteText}
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{sessionNotePage.date}</span>
          <input
            type="date"
            min={minDate}
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="session-date"
            className={`min-h-11 max-w-56 ${field}`}
          />
        </label>

        <div className="flex flex-col gap-2" data-testid="session-kind">
          <span className="text-sm text-muted" id="session-kind-label">{sessionKindCopy.label}</span>
          <div role="radiogroup" aria-labelledby="session-kind-label" className="flex flex-wrap gap-2">
            {([["regular", sessionKindCopy.regular], ["makeup", sessionKindCopy.makeup]] as const).map(([k, text]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`session-kind-${k}`} className={seg(kind === k)}
                onClick={() => { setKind(k); if (k === "regular") setMakeupFor(""); }}>
                {text}
              </button>
            ))}
          </div>
          {kind === "makeup" && makeupChoices.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{sessionKindCopy.makeupFor}</span>
              <select value={makeupFor} onChange={(e) => setMakeupFor(e.target.value)} data-testid="session-makeup-for" className={`min-h-11 max-w-72 ${field}`}>
                <option value="">{sessionKindCopy.makeupForNone}</option>
                {makeupChoices.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {taughtChoices.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{curriculumCopy.taughtTitle}</h2>
            <p className="text-sm text-muted">{curriculumCopy.taughtHelp}</p>
            <TaughtUnitsPicker choices={taughtChoices} value={taught} onChange={setTaught} disabled={saved} />
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{sessionNotePage.studied}</span>
          <input
            type="text"
            maxLength={STUDIED_MAX}
            value={studied}
            placeholder={sessionNotePage.studiedHint}
            onChange={(e) => setStudied(e.target.value)}
            data-testid="session-studied"
            className={`min-h-11 ${field}`}
          />
        </label>

        <div className="flex flex-col gap-1" data-testid="session-practised">
          <h2 className="text-base font-semibold">{sessionNotePage.practisedTitle}</h2>
          <p className="text-sm text-muted">{sessionNotePage.practisedHelp}</p>
          {skills.length === 0 ? (
            <p className="text-sm text-muted">{sessionNotePage.practisedNone}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-3">
              {saved ? null : (
                <PractisedChosen
                  chosen={practised.map((id) => ({ id, title: skills.find((x) => x.id === id)?.title ?? id }))}
                  onRemove={(id) => setPractised((cur) => cur.filter((k) => k !== id))}
                  testId="session-practised"
                />
              )}
              <DomainTabs
                buckets={skillBuckets}
                active={skillTab}
                onActive={setSkillTab}
                testId="session-practised"
                itemKey={(t) => t.id}
                itemText={(t) => t.title}
                renderItem={(t) => {
                  const on = practised.includes(t.id);
                  return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!on && practised.length >= MAX_PRACTISED_PER_NOTE}
                      onClick={() => setPractised((cur) => (cur.includes(t.id) ? cur.filter((k) => k !== t.id) : [...cur, t.id]))}
                      data-testid={`session-practised-${t.id}`}
                      className={`min-h-11 rounded-full border px-4 text-sm ${
                        on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {t.title}
                    </button>
                  );
                }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{sessionNotePage.weakTitle}</h2>
          <p className="text-sm text-muted">{sessionNotePage.weakHelp}</p>
          <TagChips tags={tags} map={map} selected={weak} onChange={setWeak} max={MAX_WEAK_TAGS_PER_NOTE} onAdd={add} onSetGroup={setGroup} testId="session-tags" />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{sessionNotePage.message}</span>
          <span className="text-muted">{sessionNotePage.messageHelp}</span>
          <textarea
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="session-message"
            className={`py-2 ${field}`}
          />
          <span className="text-xs text-muted">{sessionNotePage.messageCount(message.length, MESSAGE_MAX)}</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{sessionNotePage.noteForParent}</span>
          <span className="text-muted">{sessionNotePage.noteForParentHelp}</span>
          <textarea
            rows={3}
            maxLength={PARENT_NOTE_MAX}
            value={parentNote}
            onChange={(e) => setParentNote(e.target.value)}
            data-testid="session-parent-note"
            className={`py-2 ${field}`}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-700" data-testid="session-error">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || saved}
            data-testid="session-save"
            className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60"
          >
            {busy ? sessionNotePage.saving : sessionNotePage.save}
          </button>
          <SaveStatus state={saveState} />
        </div>
      </fieldset>

      <aside className="flex min-w-0 flex-col gap-4">
        {saved ? (
          <div role="status" className="flex flex-col gap-2 rounded-xl border border-accent bg-white p-4" data-testid="session-saved">
            <p className="font-semibold text-accent">{sessionNotePage.saved}</p>
            <Link href={`/learners/${learnerId}/results/new`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
              {sessionNotePage.savedNext}
            </Link>
            <Link href={`/learners/${learnerId}/notes`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
              {sessionNotePage.historyLink}
            </Link>
          </div>
        ) : null}

        {saved && savedId ? <UnitProposal choices={taughtChoices} taught={taught} lessonNoteId={savedId} /> : null}

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="recheck-panel">
          <h2 className="text-base font-semibold">{sessionNotePage.recheckTitle}</h2>
          {due.length === 0 ? (
            <p className="text-sm text-muted">{sessionNotePage.recheckNone}</p>
          ) : (
            <>
              <p className="text-sm text-muted">{sessionNotePage.recheckAsk}</p>
              {due.map((d) => (
                <fieldset key={d.tagKey} disabled={saved} className="m-0 flex flex-col gap-2 border-0 p-0" data-testid={`recheck-${d.tagKey}`}>
                  <legend className="text-sm font-medium">{sessionNotePage.recheckLine(d.label, d.lastSeen ? formatDateVi(d.lastSeen) : null)}</legend>
                  <div className="flex flex-wrap gap-2">
                    {RECHECK_RESULTS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={rechecks[d.tagKey] === opt}
                        data-testid={`recheck-${d.tagKey}-${opt}`}
                        onClick={() => setRechecks((cur) => ({ ...cur, [d.tagKey]: cur[d.tagKey] === opt ? null : opt }))}
                        className={seg(rechecks[d.tagKey] === opt)}
                      >
                        {sessionNotePage.recheckOptions[opt]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              <p className="text-xs text-muted">{sessionNotePage.recheckNote}</p>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <h2 className="text-base font-semibold">{sessionNotePage.homeworkTitle}</h2>
          <Link
            href={`/learners/${learnerId}/results/new`}
            data-testid="session-to-result"
            className="inline-flex min-h-11 items-center self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent"
          >
            {sessionNotePage.recordResult}
          </Link>
        </section>

        <section className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4 text-sm" data-testid="session-previous">
          {previous ? (
            <>
              <h2 className="text-base font-semibold">{sessionNotePage.previousTitle(formatDateVi(previous.sessionDate))}</h2>
              {previous.studied ? <p>{previous.studied}</p> : null}
              {previous.weakTagKeys.length > 0 ? (
                <p className="text-muted">
                  {sessionNotePage.previousReinforce}: {previous.weakTagKeys.map((k) => labelOf.get(k) ?? fallbackLabels.tag).join("; ")}
                </p>
              ) : null}
              {previous.message ? (
                <p className="text-muted">
                  {sessionNotePage.previousMessage}: “{previous.message}”
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted">{sessionNotePage.previousNone}</p>
          )}
        </section>
      </aside>
    </form>
  );
}
