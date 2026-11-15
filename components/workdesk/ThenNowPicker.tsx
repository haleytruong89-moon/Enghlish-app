"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { thenNowPickerCopy as c } from "@/lib/copy/vi";
import type { ThenNowCandidates } from "@/lib/student/growthShape";
import { clientIdBook } from "@/lib/roadmap/clientId";
import { ddmm } from "@/lib/student/week";
import { NOTE_MAX, normalizeNote, preview } from "@/lib/student/thenNow";
import { postJson } from "@/lib/tutorwork/client";

const BTN = "inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold disabled:opacity-60";
const SELECT = "min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm";

const line = (x: ThenNowCandidates["candidates"][number]) => `${ddmm(x.on)} · ${x.title ? `${x.title} — ` : ""}${preview(x.preview, 60)}`;

/**
 * "Ngày ấy – bây giờ" (W4e · Q16/Q19) on the level page of one child: the child's tutor picks two pieces of the child's own writing on the app
 * and one short note; the parent only reads. Hiding the card keeps the pair on file. The database checks everything again.
 */
export function ThenNowPicker({ learnerId, alias, view, canEdit }: { learnerId: string; alias: string; view: ThenNowCandidates; canEdit: boolean }) {
  const router = useRouter();
  const cur = view.current;
  const [thenId, setThenId] = useState(cur?.thenId ?? "");
  const [nowId, setNowId] = useState(cur?.nowId ?? "");
  const [note, setNote] = useState(cur?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const book = useRef(clientIdBook());
  const byId = new Map(view.candidates.map((x) => [x.id, x]));
  const thenPiece = byId.get(thenId);
  const nowPiece = byId.get(nowId);
  const ordered = thenPiece && nowPiece ? thenPiece.on < nowPiece.on : false;
  const noteCheck = normalizeNote(note);

  async function send(status: "shown" | "hidden") {
    if (busy) return;
    const usedThen = status === "hidden" && cur ? cur.thenId : thenId;
    const usedNow = status === "hidden" && cur ? cur.nowId : nowId;
    const usedNote = status === "hidden" && cur ? cur.note : noteCheck.ok ? noteCheck.note : null;
    if (!usedThen || !usedNow) return;
    setBusy(true);
    setMsg(null);
    const body = { then_id: usedThen, now_id: usedNow, note: usedNote, status };
    const r = await postJson(`/api/learners/${learnerId}/then-now`, { ...body, client_id: book.current.idFor(body) });
    book.current.settle({ ok: r.ok, status: r.status });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: (r.status === 0 ? c.errors.generic : c.errors[r.error]) ?? c.errors.generic ?? "" });
    setMsg({ ok: true, text: status === "hidden" ? c.hidden : c.saved });
    router.refresh();
  }

  const pairLabel = (id: string | undefined) => {
    const x = id ? byId.get(id) : undefined;
    return x ? line(x) : null;
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="then-now-picker">
      <h2 className="text-lg font-semibold">{c.title}</h2>
      <p className="mt-1 text-sm text-muted">{c.intro(alias)}</p>
      <p className="mt-1 text-xs text-muted">{c.onlyApp}</p>
      <p className="mt-3 text-sm font-medium" data-testid="then-now-state">
        {cur ? (cur.status === "shown" ? c.shownNow : c.hiddenNow) : c.noneYet}
      </p>
      {cur && (pairLabel(cur.thenId) || pairLabel(cur.nowId)) ? (
        <dl className="mt-2 grid gap-1 text-sm">
          <div><dt className="inline font-medium">{c.thenField}: </dt><dd className="inline">{pairLabel(cur.thenId) ?? "—"}</dd></div>
          <div><dt className="inline font-medium">{c.nowField}: </dt><dd className="inline">{pairLabel(cur.nowId) ?? "—"}</dd></div>
          {cur.note ? <div><dt className="inline font-medium">{c.noteLabel.split(" (")[0]}: </dt><dd className="inline">{cur.note}</dd></div> : null}
        </dl>
      ) : null}
      {!canEdit ? (
        <p className="mt-3 text-xs text-muted">{c.parentReadOnly}</p>
      ) : view.candidates.length < 2 ? (
        <p className="mt-3 text-sm text-muted" data-testid="then-now-empty">{c.empty}</p>
      ) : (
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void send("shown"); }} data-testid="then-now-form">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{c.thenField}</span>
            <select value={thenId} onChange={(e) => setThenId(e.target.value)} className={SELECT} data-testid="then-select">
              <option value="">{c.choose}</option>
              {view.candidates.map((x) => <option key={x.id} value={x.id}>{line(x)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{c.nowField}</span>
            <select value={nowId} onChange={(e) => setNowId(e.target.value)} className={SELECT} data-testid="now-select">
              <option value="">{c.choose}</option>
              {view.candidates.map((x) => <option key={x.id} value={x.id}>{line(x)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">{c.noteLabel}</span>
            <textarea rows={2} maxLength={NOTE_MAX * 2} value={note} placeholder={c.notePlaceholder} onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2" data-testid="then-now-note-input" />
            <span className="text-xs text-muted">{[...note].length}/{NOTE_MAX}</span>
          </label>
          {thenPiece && nowPiece && !ordered ? <p role="alert" className="text-sm font-medium text-[#7a2a0c] sm:col-span-2" data-testid="then-now-order">{c.errors.bad_pick}</p> : null}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={busy || !thenPiece || !nowPiece || !ordered || !noteCheck.ok} data-testid="then-now-save" className={`${BTN} bg-accent text-white`}>
              {busy ? c.saving : c.save}
            </button>
            {cur && cur.status === "shown" ? (
              <button type="button" disabled={busy} onClick={() => void send("hidden")} data-testid="then-now-hide" className={`${BTN} border border-line bg-white font-medium`}>
                {c.hide}
              </button>
            ) : null}
          </div>
        </form>
      )}
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} data-testid="then-now-msg" className={`mt-3 text-sm font-medium ${msg.ok ? "text-accent" : "text-[#7a2a0c]"}`}>{msg.text}</p>
      ) : null}
    </section>
  );
}
