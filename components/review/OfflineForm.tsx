"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { offlineForm } from "@/lib/copy/vi";
import { OFFLINE_ASSISTANCE } from "@/lib/review/types";

/**
 * "Ghi bài làm ngoài app": the tutor records a piece of work done live in the session or on paper (text only, never audio).
 * Only a tutor may claim "watched live"; a parent can record paper work. The database re-checks both.
 */
export function OfflineForm({
  learnerId,
  activityId,
  isTutor,
  tutorOnly = false,
  liveOnly = false,
  minDate,
  maxDate,
}: {
  learnerId: string;
  activityId: string;
  isTutor: boolean;
  /** Checkpoint step or live speaking step: only the tutor records it (the database re-checks). */
  tutorOnly?: boolean;
  /** Live speaking step: recorded as "watched live" only (no paper option). */
  liveOnly?: boolean;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provenance, setProvenance] = useState<"tutor_live" | "manual_import">(isTutor || liveOnly ? "tutor_live" : "manual_import");
  const [date, setDate] = useState(maxDate);
  const [text, setText] = useState("");
  const [duration, setDuration] = useState("");
  const [words, setWords] = useState("");
  const [help, setHelp] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());
  const base = activityId;

  function toggleHelp(h: string, on: boolean) {
    setHelp((cur) => {
      if (!on) return cur.filter((x) => x !== h);
      // "none" and "unknown" stand alone
      if (h === "none" || h === "unknown") return [h];
      return [...cur.filter((x) => x !== "none" && x !== "unknown"), h];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length === 0) return setError(offlineForm.textRequired);
    if (help.length === 0) return setError(offlineForm.helpRequired);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/learners/${learnerId}/offline-attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId.current,
          activity_id: activityId,
          provenance,
          text: text.trim(),
          session_date: date,
          assistance: help,
          ...(duration.trim() !== "" ? { duration_sec: Number(duration) } : {}),
          ...(words.trim() !== "" ? { word_count: Number(words) } : {}),
        }),
      });
      if (res.status === 403) return setError(offlineForm.errorForbidden);
      if (!res.ok) return setError(offlineForm.error);
      const body = (await res.json()) as { episode_id?: string };
      setEpisodeId(body.episode_id ?? null);
      clientId.current = crypto.randomUUID();
      setText("");
      setDuration("");
      setWords("");
      setHelp([]);
      setOpen(false);
      router.refresh();
    } catch {
      setError(offlineForm.error);
    } finally {
      setBusy(false);
    }
  }

  const btn = "min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent";

  if (!isTutor && (tutorOnly || liveOnly)) {
    return (
      <p className="mt-2 text-sm text-muted" data-testid={`offline-tutor-only-${activityId}`}>
        {offlineForm.tutorOnlyNote}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" data-testid={`offline-open-${activityId}`} className={btn} onClick={() => { setOpen(true); setEpisodeId(null); }}>
          {offlineForm.open}
        </button>
        {episodeId ? (
          <span role="status" className="text-sm" data-testid={`offline-done-${activityId}`}>
            {offlineForm.done}{" "}
            <Link href={`/review/${episodeId}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline">
              {offlineForm.openReview}
            </Link>
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3 rounded-lg border border-line bg-white p-3" data-testid={`offline-form-${activityId}`}>
      <p className="text-sm font-semibold">{offlineForm.title}</p>
      <p className="text-xs text-muted">{offlineForm.intro}</p>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{offlineForm.kind}</legend>
        {isTutor ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name={`kind-${base}`} className="size-4" checked={provenance === "tutor_live"} onChange={() => setProvenance("tutor_live")} />
            {offlineForm.kindLive}
          </label>
        ) : null}
        {liveOnly ? null : (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name={`kind-${base}`} className="size-4" checked={provenance === "manual_import"} onChange={() => setProvenance("manual_import")} />
            {offlineForm.kindPaper}
          </label>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`date-${base}`} className="text-sm text-muted">
          {offlineForm.date}
        </label>
        <input id={`date-${base}`} type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-lg border border-line px-3" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`text-${base}`} className="text-sm text-muted">
          {offlineForm.text}
        </label>
        <textarea id={`text-${base}`} data-testid={`offline-text-${activityId}`} rows={5} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} className="rounded-lg border border-line px-3 py-2" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`dur-${base}`} className="text-sm text-muted">
            {offlineForm.duration}
          </label>
          <input id={`dur-${base}`} type="number" inputMode="numeric" min={0} max={7200} value={duration} onChange={(e) => setDuration(e.target.value)} className="min-h-11 rounded-lg border border-line px-3" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`words-${base}`} className="text-sm text-muted">
            {offlineForm.words}
          </label>
          <input id={`words-${base}`} type="number" inputMode="numeric" min={0} max={20000} value={words} onChange={(e) => setWords(e.target.value)} className="min-h-11 rounded-lg border border-line px-3" />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{offlineForm.help}</legend>
        {OFFLINE_ASSISTANCE.map((h) => (
          <label key={h} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" data-testid={`offline-help-${activityId}-${h}`} className="size-4" checked={help.includes(h)} onChange={(e) => toggleHelp(h, e.target.checked)} />
            {offlineForm.helpOptions[h] ?? h}
          </label>
        ))}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid={`offline-error-${activityId}`}>
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} data-testid={`offline-save-${activityId}`} className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? offlineForm.saving : offlineForm.save}
        </button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>
          {offlineForm.cancel}
        </button>
      </div>
    </form>
  );
}
