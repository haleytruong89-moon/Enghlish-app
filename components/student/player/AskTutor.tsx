"use client";

import { useRef, useState } from "react";
import { tutorCopy as c } from "@/lib/copy/vi";
import { langOf } from "@/lib/studio/taskParts";

export type TutorTurnView = { text: string; level: number; kind: "hint" | "question" | "fixed"; childText: string | null; fixed?: string | null };

/**
 * E1 · "Hỏi" under one question of a Studio practice test. Each press asks the server for the next hint (H1 → H2 → H3, the server owns
 * the level); the child may also send a short question about this question. Never shown on a test (the server refuses too, L2).
 * The turns of each question live in the Player, so moving between questions keeps them.
 */
export function AskTutor({
  activityId, itemId, turns, onTurn,
}: { activityId: string; itemId: string; turns: TutorTurnView[]; onTurn: (t: TutorTurnView) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const last = turns[turns.length - 1] ?? null;
  // "All 3 steps used", "today's limit" and "no AI for this kind of question" end the tutor for this question; "Gia sư đang nghỉ" /
  // a passing error do not.
  const done = turns.some((t) => t.kind === "fixed" && (t.fixed === "max_level" || t.fixed === "daily_limit" || t.fixed === "passage" || t.fixed === "no_answer"));
  // The same press retried after a network error keeps its client id: the server returns the turn it may already have made.
  const intent = useRef<{ key: string; id: string } | null>(null);
  const level = Math.max(0, ...turns.filter((t) => t.kind === "hint").map((t) => t.level));

  function clientIdFor(text: string | null): string {
    const key = `${turns.length}|${text ?? ""}`;
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() };
    return intent.current.id;
  }

  async function ask(text: string | null) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/student/activities/${activityId}/hints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_id: itemId, client_id: clientIdFor(text), ...(text ? { question: text } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as { text?: string; level?: number; kind?: TutorTurnView["kind"]; fixed?: string | null; error?: string } | null;
      if (!res.ok || !body?.text) return setProblem(c.errors[body?.error ?? ""] ?? c.errors.network!);
      intent.current = null;
      onTurn({ text: body.text, level: Number(body.level ?? 0), kind: body.kind ?? "hint", childText: text, fixed: body.fixed ?? null });
      setQuestion("");
      setOpen(false);
    } catch {
      setProblem(c.errors.network!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={c.name} className="flex flex-col gap-2" data-testid={`ask-${itemId}`}>
      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-xl border border-[#EBD88F] bg-[#FFF7D9] px-3.5 py-2.5" data-testid="tutor-turn" data-kind={t.kind}>
          {t.childText ? <p className="text-[13px] text-muted">“{t.childText}”</p> : null}
          <p className="text-[13px] font-semibold text-[#6B5200]">
            {c.name}
            {t.kind === "hint" ? ` · ${c.levelOf(t.level)}` : ""}
          </p>
          <p lang={langOf(t.text)} className="whitespace-pre-line text-[15px] leading-snug" data-testid="tutor-text">{t.text}</p>
        </div>
      ))}
      {busy ? <p role="status" className="text-sm text-muted" data-testid="tutor-thinking">{c.thinking}</p> : null}
      {problem ? <p role="alert" className="text-sm text-[#8A1C12]" data-testid="tutor-error">{problem}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {!done && level < 3 ? (
          <button type="button" disabled={busy} onClick={() => void ask(null)} data-testid="tutor-ask"
            className="min-h-11 rounded-xl border border-[#D9C26A] bg-[#FFF7D9] px-4 text-sm font-semibold text-[#5A4500] disabled:opacity-60">
            {last ? c.next : c.ask}
          </button>
        ) : null}
        {!done ? (
          <button type="button" disabled={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="tutor-open-question"
            className="min-h-11 rounded-xl px-3 text-sm text-accent underline disabled:opacity-60">
            {c.questionLabel}
          </button>
        ) : null}
      </div>
      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) void ask(question.trim()); }} className="flex flex-col gap-2" data-testid="tutor-question-form">
          <input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder={c.questionPlaceholder} aria-label={c.questionLabel}
            data-testid="tutor-question" className="min-h-11 rounded-xl border border-line bg-white px-3 text-[15px]" />
          <p className="text-[13px] text-muted">{c.questionNote}</p>
          <button type="submit" disabled={busy || !question.trim()} data-testid="tutor-send" className="min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
            {c.send}
          </button>
        </form>
      ) : null}
      {!done && level >= 3 ? <p className="text-sm text-muted" data-testid="tutor-last">{c.fixed.max_level}</p> : null}
      {turns.length === 0 ? <p className="text-xs text-muted">{c.note}</p> : null}
    </section>
  );
}
