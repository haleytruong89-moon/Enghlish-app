"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { weeklyGoalCopy as c } from "@/lib/copy/vi";
import { clientIdBook } from "@/lib/roadmap/clientId";

type Props = {
  options: number[];
  /** The goal of this week (null = none yet). */
  current: number | null;
  /** The number the picker starts on. */
  initial: number;
  pending: { id: string; pieces: number } | null;
  upcomingPieces: number | null;
  /** "adjust" = the tutor changed the number: the child is told so, not "agreed". */
  upcomingKind?: "accept" | "adjust";
  suggestion: string | null;
};

const wordFor = (i: number, n: number): string => c.words[n <= c.words.length ? i : Math.min(c.words.length - 1, Math.round((i / Math.max(1, n - 1)) * (c.words.length - 1)))] ?? "";

/** "Đặt mục tiêu tuần": the child picks a number inside the track's range and sends it to the tutor; or takes a waiting proposal back. */
export function GoalPicker({ options, current, initial, pending, upcomingPieces, upcomingKind, suggestion }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const book = useRef(clientIdBook());

  async function call(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const payload = { path, body };
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, client_id: book.current.idFor(payload) }),
      });
      book.current.settle({ ok: res.ok, status: res.status });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(c.errors[err?.error ?? ""] ?? c.errors.generic ?? "");
        return;
      }
      router.refresh();
    } catch {
      book.current.settle({ ok: false, status: 0 });
      setProblem(c.errors.generic ?? "");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <section className="rounded-2xl border-2 border-amber-300 bg-white p-5" data-testid="goal-waiting">
        <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{c.waitingTag}</span>
        <p className="mt-3 text-xl font-bold">{c.waitingTitle(pending.pieces)}</p>
        <p className="mt-1 text-muted">{c.waitingNote(current)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => call("/api/student/goal/withdraw", { goal_id: pending.id })} data-testid="goal-withdraw" className="min-h-12 rounded-xl border border-line bg-white px-5 text-[16px] font-semibold disabled:opacity-60">
            {busy ? c.withdrawing : c.withdraw}
          </button>
          {problem ? <p role="alert" className="text-sm font-semibold text-[#8a1f11]" data-testid="goal-problem">{problem}</p> : null}
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5" data-testid="goal-picker">
      {upcomingPieces !== null ? (
        <p className="rounded-xl bg-[#E3ECE8] px-3 py-2 text-[15px] font-semibold text-[#1F4439]" data-testid="goal-agreed">{c.agreed(upcomingPieces, upcomingKind)}</p>
      ) : null}
      <div>
        <h2 className="mb-2 text-lg font-semibold">{c.question}</h2>
        <div role="radiogroup" aria-label={c.groupLabel} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {options.map((n, i) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={sel === n}
              onClick={() => setSel(n)}
              data-testid={`goal-option-${n}`}
              className={`flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2 ${sel === n ? "border-accent bg-[#E3ECE8]" : "border-line bg-white"}`}
            >
              <b className={`text-3xl leading-none ${sel === n ? "text-accent" : ""}`}>{n}</b>
              <span className="text-[13.5px] text-muted">{c.unit} · {wordFor(i, options.length)}</span>
            </button>
          ))}
        </div>
      </div>
      {suggestion ? (
        <p className="rounded-xl bg-[#F1F6F3] px-3 py-2 text-[15px]" data-testid="goal-suggestion"><strong>{c.suggest}</strong> {suggestion}</p>
      ) : null}
      <p className="text-sm text-muted">{c.rules} {c.oneIsOne}</p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {problem ? <p role="alert" className="mr-auto text-sm font-semibold text-[#8a1f11]" data-testid="goal-problem">{problem}</p> : null}
        <button type="button" disabled={busy} onClick={() => call("/api/student/goal", { pieces: sel })} data-testid="goal-send" className="min-h-12 rounded-xl bg-accent px-6 text-[16px] font-semibold text-white disabled:opacity-60">
          {busy ? c.sending : c.send}
        </button>
      </div>
    </section>
  );
}
