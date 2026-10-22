"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { feedbackCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import { revisionFailText } from "@/lib/revision/client";
import { checkFeedback } from "@/lib/revision/rules";
import type { FeedbackItem, FeedbackPanelView } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { postJson } from "@/lib/tutorwork/client";
import { emptyItem, FeedbackFields, feedbackPayloadItems, type FeedbackDraft } from "./FeedbackFields";
import { findLeaf } from "./LeafPicker";

/** Numbered items with their excerpt and the NAME of their skill (never its key). Shared by the panel and the before–after view. */
export function FeedbackItemsList({ items, map }: { items: FeedbackItem[]; map: SkillMapView | null }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((it) => {
        const leaf = it.leaf && map ? findLeaf(map, it.leaf) : null;
        return (
          <li key={it.n} data-testid={`feedback-item-${it.n}`} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2 text-sm">
            <span>
              <b>{feedbackCopy.itemLabel(it.n)}.</b> {it.text}
            </span>
            {it.excerpt ? (
              <q lang="en" className="block rounded bg-[#FBF1DC] px-2 py-1 text-[#6B4600] [quotes:none]">
                “{it.excerpt}”
              </q>
            ) : null}
            {leaf ? <span className="self-start rounded-full bg-[#E3ECE8] px-2 py-0.5 text-xs text-[#1F4439]">{leaf.label}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

const toDraftItems = (items: FeedbackItem[]) => items.map((i) => ({ text: i.text, excerpt: i.excerpt ?? "", leaf: i.leaf }));

/**
 * "Góp ý cho con" beside the work (spec §2 step 2): one praise, 1–3 items, "Yêu cầu con sửa bài" (default) or "Chỉ góp ý". After sending:
 * the note, the child's progress, "Sửa góp ý" while the database still allows it (author, before the child starts), older versions.
 * Score words are refused here and again by the server and the database.
 */
export function FeedbackPanel({ attemptId, panel, map }: { attemptId: string; panel: FeedbackPanelView; map: SkillMapView | null }) {
  const router = useRouter();
  const live = panel.live;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>({ praise: "", items: [emptyItem()] });
  const [requires, setRequires] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  if (!panel.eligible) return null;
  const formOpen = (panel.canGive && !live) || editing;

  function startEdit() {
    if (!live) return;
    setDraft({ praise: live.praise, items: toDraftItems(live.items) });
    setRequires(live.requiresRevision);
    clientId.current = crypto.randomUUID();
    setEditing(true);
  }

  async function send() {
    const p = checkFeedback(draft.praise, draft.items, panel.text);
    if (p) return setProblem(feedbackCopy.errors[p] ?? null);
    setBusy(true);
    setProblem(null);
    const r = await postJson(`/api/review/attempts/${attemptId}/feedback`, {
      client_id: clientId.current,
      praise: draft.praise.trim(),
      items: feedbackPayloadItems(draft.items),
      requires_revision: requires,
      ...(editing && live ? { supersedes_id: live.id } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) clientId.current = crypto.randomUUID();
      return setProblem(revisionFailText(r));
    }
    clientId.current = crypto.randomUUID();
    setEditing(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="feedback-title" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="feedback-panel">
      <h3 id="feedback-title" className="text-base font-bold">
        {feedbackCopy.title}
      </h3>

      {live && !editing ? (
        <div className="flex flex-col gap-2" data-testid="feedback-live">
          <p className="text-sm text-muted">
            {feedbackCopy.liveTitle} · {feedbackCopy.byLine(live.authorName, formatWhen(live.createdAt))} · {feedbackCopy.modeLine(live.requiresRevision)}
          </p>
          <p className="rounded-lg bg-[#E3ECE8] px-3 py-2 text-[#1F4439]" data-testid="feedback-live-praise">
            {live.praise}
          </p>
          <FeedbackItemsList items={live.items} map={map} />
          {live.revisionState ? (
            <p className="text-sm" data-testid="feedback-revision-state">
              {feedbackCopy.revisionState[live.revisionState]}
              {live.revisionEpisodeId ? (
                <>
                  {" · "}
                  <Link href={`/review/${live.revisionEpisodeId}`} className="text-accent underline">
                    {feedbackCopy.openRevision}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {live.editable ? (
            <>
              <button type="button" onClick={startEdit} data-testid="feedback-edit" className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
                {feedbackCopy.edit}
              </button>
              <p className="text-xs text-muted">{feedbackCopy.editHint}</p>
            </>
          ) : null}
          {panel.history.length > 0 ? (
            <details data-testid="feedback-history" className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2">{feedbackCopy.history(panel.history.length)}</summary>
              {panel.history.map((h) => (
                <div key={h.id} className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                  <p className="text-xs text-muted">{feedbackCopy.byLine(h.authorName, formatWhen(h.createdAt))}</p>
                  <p>{h.praise}</p>
                  <FeedbackItemsList items={h.items} map={map} />
                </div>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}

      {formOpen ? (
        <div className="flex flex-col gap-3" data-testid="feedback-form">
          <p className="text-sm text-muted">{feedbackCopy.intro}</p>
          <FeedbackFields value={draft} onChange={(v) => { setDraft(v); setProblem(null); }} map={map} testIdPrefix="feedback" />
          {/* A round-2 note always asks for a revision (D7): editing one offers no "Chỉ góp ý". */}
          {editing && live && live.round > 1 ? null : (
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="text-sm font-semibold">{feedbackCopy.modeLegend}</legend>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="radio" name="feedback-mode" checked={requires} onChange={() => setRequires(true)} data-testid="feedback-require" className="mt-1 h-5 w-5 accent-[#2B5D4F]" />
              <span>
                <b>{feedbackCopy.requireRevision}</b>
                <span className="block text-muted">{feedbackCopy.requireRevisionHint}</span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="radio" name="feedback-mode" checked={!requires} onChange={() => setRequires(false)} data-testid="feedback-note-only" className="mt-1 h-5 w-5 accent-[#2B5D4F]" />
              <span>
                <b>{feedbackCopy.noteOnly}</b>
                <span className="block text-muted">{feedbackCopy.noteOnlyHint}</span>
              </span>
            </label>
          </fieldset>
          )}
          {problem ? (
            <p role="alert" data-testid="feedback-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={send} data-testid="feedback-send" className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60">
              {busy ? feedbackCopy.sending : editing ? feedbackCopy.saveEdit : feedbackCopy.send}
            </button>
            {editing ? (
              <button type="button" onClick={() => setEditing(false)} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base">
                {feedbackCopy.cancel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!live && !panel.canGive ? (
        <p className="text-sm text-muted" data-testid="feedback-read-only">
          {feedbackCopy.readOnly}
        </p>
      ) : null}
    </section>
  );
}
