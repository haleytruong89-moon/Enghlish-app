"use client";

import { useRef, useState } from "react";
import { tutorPageCopy as c } from "@/lib/copy/vi";
import type { CardView } from "@/lib/notebook/card";
import { VocabCard } from "./VocabCard";

type Entry =
  | { key: string; word: string; kind: "card"; askId: string; card: CardView }
  | { key: string; word: string; kind: "not_word"; suggestions: string[] }
  | { key: string; word: string; kind: "fixed"; text: string };

/**
 * E2a · "Tra từ": one word or short phrase (+ optional sentence) → the server's turn → a word card, spelling suggestions or a fixed
 * sentence. Answers of this visit stack newest first. The same press retried after a network error keeps its client id (the server
 * returns the ask it may already have made).
 */
export function LookupForm({ off }: { off: boolean }) {
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const intent = useRef<{ key: string; id: string } | null>(null);
  // A second submit in the same tick (double tap, Enter + click) must not start a second paid turn: state updates are not instant.
  const inFlight = useRef(false);

  function clientIdFor(key: string): string {
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() };
    return intent.current.id;
  }

  async function lookup(w: string, ctx: string) {
    const text = w.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const key = `${entries.length}|${text}|${ctx}`;
    try {
      const res = await fetch("/api/student/tutor/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: text, ...(ctx.trim() ? { context: ctx.trim() } : {}), client_id: clientIdFor(key) }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body?.kind) {
        setProblem(c.errors[String(body?.error ?? "")] ?? c.errors.network!);
        return;
      }
      intent.current = null;
      const id = `${Date.now()}-${entries.length}`;
      const entry: Entry =
        body.kind === "card"
          ? { key: id, word: text, kind: "card", askId: String(body.askId), card: body.card as CardView }
          : body.kind === "not_word"
            ? { key: id, word: text, kind: "not_word", suggestions: (body.suggestions as string[]) ?? [] }
            : { key: id, word: text, kind: "fixed", text: c.fixed[String(body.fixed)] ?? c.fixed.ai_error! };
      setEntries((e) => [entry, ...e]);
      setWord("");
      setContext("");
    } catch {
      setProblem(c.errors.network!);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(word, context);
        }}
        className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4"
        data-testid="lookup-form"
      >
        <span className="self-start rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">{c.tabWord}</span>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{c.wordLabel}</span>
          <div className="flex gap-2">
            <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={80} lang="en" autoComplete="off" autoCapitalize="none" spellCheck={false}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-line px-3.5 text-base" data-testid="lookup-word" />
            <button type="submit" disabled={busy || !word.trim()} className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-60" data-testid="lookup-send">
              {busy ? c.thinking : c.send}
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{c.contextLabel}</span>
          <input value={context} onChange={(e) => setContext(e.target.value)} maxLength={400} lang="en" placeholder={c.contextHint}
            className="min-h-11 rounded-xl border border-line px-3.5 text-[15px]" data-testid="lookup-context" />
        </label>
        {off ? <p className="rounded-xl bg-[#FBF1DC] px-3 py-2 text-sm text-[#6B4600]" data-testid="tutor-off">{c.off}</p> : null}
        {problem ? <p role="alert" className="text-sm text-[#8a2f12]" data-testid="lookup-problem">{problem}</p> : null}
      </form>

      {entries.length ? <h2 className="text-lg font-bold">{c.answers}</h2> : null}
      <div className="flex flex-col gap-4" data-testid="lookup-answers">
        {entries.map((e) => (
          <div key={e.key} className="flex flex-col gap-2">
            <p className="self-end rounded-2xl rounded-br-sm bg-[#e8efe9] px-3 py-1.5" lang="en">{e.word}</p>
            {e.kind === "card" ? (
              <VocabCard card={e.card} askId={e.askId} onLookup={(w) => void lookup(w, "")} />
            ) : e.kind === "not_word" ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-[#EBD88F] bg-[#FFF7D9] px-4 py-3" data-testid="not-word">
                <p>{e.suggestions.length ? c.notWord : c.notWordNone}</p>
                <div className="flex flex-wrap gap-2">
                  {e.suggestions.map((s) => (
                    <button key={s} type="button" lang="en" onClick={() => void lookup(s, "")} className="min-h-11 rounded-full border border-line bg-white px-4" data-testid={`suggest-${s}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-[#EBD88F] bg-[#FFF7D9] px-4 py-3" data-testid="lookup-fixed">{e.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
