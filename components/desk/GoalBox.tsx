"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { goalDeskCopy as c } from "@/lib/copy/vi";
import { clientIdBook } from "@/lib/roadmap/clientId";
import { ddmm } from "@/lib/student/week";

export type GoalBoxView = {
  goal: number | null;
  count: number;
  streak: number;
  upcoming: { pieces: number; from: string } | null;
  pending: { id: string; pieces: number } | null;
  /** The Monday a decision taken now would start. */
  nextMonday: string;
};

const BTN = "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold";

/**
 * "Mục tiêu tuần" on the desk of one child (W4d). Everyone of the family reads it; only the child's tutor sees the buttons (Q19). A decision is an
 * explicit button that names the number and the Monday it starts — never a hidden one-click. The database sets the Monday; it is not sent.
 */
export function GoalBox({ learnerId, alias, canDecide, view }: { learnerId: string; alias: string; canDecide: boolean; view: GoalBoxView }) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState(false);
  const [pieces, setPieces] = useState(view.pending ? String(view.pending.pieces) : "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const book = useRef(clientIdBook());

  async function decide(action: "accept" | "adjust") {
    if (!view.pending || busy) return;
    const n = Number(pieces);
    if (action === "adjust" && (!Number.isInteger(n) || n < 1 || n > 14 || n === view.pending.pieces)) {
      setProblem(c.errors.bad_pieces ?? "");
      return;
    }
    setBusy(true);
    setProblem(null);
    const body = action === "accept" ? { action } : { action, pieces: n };
    try {
      const res = await fetch(`/api/learners/${learnerId}/goals/${view.pending.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, client_id: book.current.idFor(body) }),
      });
      book.current.settle({ ok: res.ok, status: res.status });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(c.errors[err?.error ?? ""] ?? c.errors.generic ?? "");
        return;
      }
      setAdjusting(false);
      router.refresh();
    } catch {
      book.current.settle({ ok: false, status: 0 });
      setProblem(c.errors.generic ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="goal-box" className="rounded-2xl border border-line bg-white p-4" aria-labelledby="goal-box-title" data-testid="goal-box">
      <h2 id="goal-box-title" className="text-lg font-semibold">{c.title}</h2>
      <p className="mt-1 text-sm" data-testid="goal-box-line">
        {view.goal === null ? c.thisWeekNoGoal(view.count) : c.thisWeek(view.count, view.goal, view.streak)}
      </p>
      {view.upcoming ? <p className="mt-1 text-sm text-muted" data-testid="goal-box-upcoming">{c.upcoming(view.upcoming.pieces, ddmm(view.upcoming.from))}</p> : null}
      {view.pending ? (
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3" data-testid="goal-box-pending">
          <p className="font-semibold">{c.proposal(view.pending.pieces)}</p>
          <p className="mt-1 text-sm text-muted">{c.startsOn(ddmm(view.nextMonday))}</p>
          {canDecide ? (
            adjusting ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  {c.adjustLabel}
                  <input type="number" inputMode="numeric" min={1} max={14} value={pieces} onChange={(e) => setPieces(e.target.value)} data-testid="goal-adjust-input" className="min-h-11 w-28 rounded-xl border border-line px-3 text-[16px]" />
                </label>
                <button type="button" disabled={busy} onClick={() => decide("adjust")} data-testid="goal-adjust-save" className={`${BTN} bg-accent text-white disabled:opacity-60`}>{busy ? c.saving : c.adjustSave}</button>
                <button type="button" disabled={busy} onClick={() => { setAdjusting(false); setProblem(null); }} className={`${BTN} border border-line bg-white`}>{c.cancel}</button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={busy} onClick={() => decide("accept")} data-testid="goal-accept" className={`${BTN} bg-accent text-white disabled:opacity-60`}>{busy ? c.saving : c.accept(view.pending.pieces)}</button>
                <button type="button" disabled={busy} onClick={() => setAdjusting(true)} data-testid="goal-adjust" className={`${BTN} border border-line bg-white`}>{c.adjust}</button>
              </div>
            )
          ) : (
            <p className="mt-2 text-sm font-semibold" data-testid="goal-box-parent-note">{c.parentWaiting}</p>
          )}
          {problem ? <p role="alert" className="mt-2 text-sm font-semibold text-[#8a1f11]" data-testid="goal-box-problem">{problem}</p> : null}
        </div>
      ) : view.goal === null && !view.upcoming ? (
        <p className="mt-2 text-sm text-muted">{c.noGoalHint}</p>
      ) : null}
      <p className="mt-3 text-[13px] text-muted">{alias}: {c.countsHint}</p>
    </section>
  );
}
