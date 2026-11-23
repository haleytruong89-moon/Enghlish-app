"use client";

import { useState } from "react";
import { tutorPageCopy, vocabCardCopy as c } from "@/lib/copy/vi";
import type { CardView } from "@/lib/notebook/card";
import type { AgainView } from "@/lib/notebook/lookup";
import { SpeakButton, useHasVoice } from "./SpeakButton";

type Rating = "good" | "ok" | "confused";

const block = "flex flex-col gap-1.5";
const head = "text-xs font-bold uppercase tracking-wide text-[#6B5200]";
const opt = (state: "idle" | "right" | "wrong") =>
  `min-h-11 rounded-xl px-3.5 py-2 text-left text-[15px] ${state === "right" ? "border-2 border-[#2b7a4b] bg-[#e3f1e8] font-semibold" : state === "wrong" ? "border-2 border-[#b4531c] bg-[#fbe9e2] font-semibold" : "border border-line bg-white"}`;

/** A self-check question: pick one, see ✓ / ✗ and why. Never a total (the child never sees a score). */
function Check({ q, options, right, note, id }: { q: string; options: string[]; right: number; note: string; id: string }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3" data-testid={`check-${id}`}>
      <p className="font-semibold">{q}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <button key={i} type="button" onClick={() => setPick(i)} disabled={pick !== null}
            className={opt(pick === null ? "idle" : i === right ? "right" : i === pick ? "wrong" : "idle")}>
            {o}
          </button>
        ))}
      </div>
      {pick !== null ? <p className="text-sm text-muted" data-testid={`check-note-${id}`}>{pick === right ? c.right : c.wrong} {note}</p> : null}
    </div>
  );
}

/**
 * E2a · one word card in the §4.5 order: 🤔 guess first (the rest appears after a pick or "Xem luôn": the only press), then 💡 essence,
 * 📌 quick examples, ❓ why + Vietnamese + trap, 🔗 related, ✏️ self-check, 🎯 your turn — all always open. IPA comes from the server
 * (code, L3); 🔊 uses a voice of the device (L5). With no `askId` (a card opened from Sổ tay / "Từ vừa tra") there is no
 * "Chưa hiểu" and no 😊.
 */
export function VocabCard({
  card, askId, onLookup, saved: savedAtFirst = false,
}: { card: CardView; askId: string | null; onLookup?: (word: string) => void; saved?: boolean }) {
  const [guess, setGuess] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [save, setSave] = useState<"idle" | "busy" | "saved" | "already">(savedAtFirst ? "already" : "idle");
  const [again, setAgain] = useState<AgainView | null>(null);
  const [againBusy, setAgainBusy] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const hasVoice = useHasVoice();
  const shown = open || guess !== null;

  async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { ok: res.ok, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
    } catch {
      return { ok: false, data: { error: "network" } };
    }
  }
  async function onSave() {
    setSave("busy");
    setProblem(null);
    const r = await post("/api/student/notebook", { card_id: card.cardId, client_id: crypto.randomUUID() });
    if (r.ok) setSave(r.data?.already ? "already" : "saved");
    else {
      setSave("idle");
      setProblem(tutorPageCopy.errors[String(r.data?.error ?? "")] ?? tutorPageCopy.errors.network!);
    }
  }
  async function onAgain() {
    if (!askId) return;
    setAgainBusy(true);
    setProblem(null);
    const r = await post(`/api/student/tutor/asks/${askId}/again`, { client_id: crypto.randomUUID() });
    setAgainBusy(false);
    if (r.ok && r.data?.kind === "again") setAgain(r.data.again as AgainView);
    else if (r.ok && r.data?.kind === "fixed") setProblem(tutorPageCopy.fixed[String(r.data.fixed)] ?? tutorPageCopy.fixed.ai_error!);
    else setProblem(tutorPageCopy.errors[String(r.data?.error ?? "")] ?? tutorPageCopy.errors.network!);
  }
  async function onRate(v: Rating) {
    if (!askId) return;
    setRating(v);
    await post(`/api/student/tutor/asks/${askId}/rate`, { rating: v });
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-[#EBD88F] bg-[#FFF7D9] px-4 py-4 sm:px-5" data-testid="vocab-card" data-card-id={card.cardId}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-2xl font-bold" lang="en">{card.headword}</h3>
          <span className="text-muted">{card.pos}</span>
        </div>
        {card.lemma_note ? <p className="text-sm text-muted">{card.lemma_note}</p> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(["uk", "us"] as const).map((a) =>
            card.ipa[a] ? (
              <span key={a} className="flex items-center gap-2" data-testid={`ipa-${a}`}>
                <span className="text-sm text-muted">{a === "uk" ? c.uk : c.us}</span>
                <span className="font-mono text-[15px]" lang="en">{card.ipa[a]}</span>
                <SpeakButton text={card.headword} accent={a} />
              </span>
            ) : null,
          )}
        </div>
      </header>

      <section className={`${block} rounded-xl border border-dashed border-[#c9b25a] bg-white px-3.5 py-3`} data-testid="card-guess">
        <h4 className={head}>{c.guess}</h4>
        <p className="text-[15px] leading-relaxed">{card.guess.q}</p>
        <div className="flex flex-col gap-2">
          {card.guess.options.map((o, i) => (
            <button key={i} type="button" onClick={() => guess === null && setGuess(i)} disabled={guess !== null}
              className={opt(guess === null ? "idle" : i === card.guess.right ? "right" : i === guess ? "wrong" : "idle")} data-testid={`guess-${i}`}>
              {o}
            </button>
          ))}
        </div>
        {guess !== null ? (
          <p className="font-semibold" data-testid="guess-result">{guess === card.guess.right ? `${c.right} ${card.guess.yes}` : `${c.wrong} ${card.guess.no}`}</p>
        ) : !open ? (
          <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start px-1 font-semibold text-accent underline" data-testid="guess-skip">
            {c.seeAll}
          </button>
        ) : null}
      </section>

      {shown ? (
        <div className="flex flex-col gap-4" data-testid="card-body">
          <section className={block}>
            <h4 className={head}>{c.core}</h4>
            <p className="text-[17px] font-semibold leading-snug" data-testid="card-core">{card.core}</p>
          </section>
          <section className={block}>
            <h4 className={head}>{c.quick}</h4>
            <ul className="flex flex-col gap-1 text-[15px]" aria-label={c.meanings}>
              {card.senses.map((s, i) => (
                <li key={i} className={card.sense === i ? "font-bold" : ""} data-testid={`sense-${i}`}>
                  {s.meaning_en ? <span lang="en">{s.meaning_en} · </span> : null}
                  {s.meaning_vi}
                </li>
              ))}
            </ul>
            {card.examples.map((e, i) => (
              <div key={i} className="rounded-xl bg-white px-3.5 py-2">
                <p lang="en">{e.en}</p>
                <p className="text-sm text-muted">{e.vi}</p>
              </div>
            ))}
          </section>
          <section className={block} data-testid="card-why">
            <h4 className={head}>{c.why}</h4>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{card.why}</p>
            <p className="text-[15px]"><strong>{c.vn}</strong> {card.vn}</p>
            <p className="text-[15px]"><strong>{c.trap}</strong> {card.trap}</p>
            <p className="text-sm text-muted"><strong>{c.stress}</strong> {card.stress_tip}</p>
            {card.family.length ? <p className="text-sm text-muted"><strong>{c.family}</strong> <span lang="en">{card.family.map((f) => `${f.form} (${f.pos})`).join(" · ")}</span></p> : null}
            <p className="text-sm text-muted"><strong>{c.collocations}</strong> <span lang="en">{card.collocations.join(" · ")}</span></p>
          </section>
          <section className={block} data-testid="card-related">
            <h4 className={head}>{c.related}</h4>
            <div className="flex flex-wrap gap-2">
              {card.related.map((r) => (
                <button key={r} type="button" lang="en" onClick={() => onLookup?.(r)} disabled={!onLookup}
                  className="min-h-11 rounded-full border border-line bg-white px-4 text-sm" data-testid={`related-${r}`}>
                  {r}
                </button>
              ))}
            </div>
            {onLookup ? <p className="text-sm text-muted">{c.relatedHint}</p> : null}
          </section>
          <section className={block} data-testid="card-checks">
            <h4 className={head}>{c.checks}</h4>
            {card.checks.map((k, i) => <Check key={i} id={String(i)} {...k} />)}
          </section>
          <section className={`${block} rounded-xl bg-[#e8efe9] px-3.5 py-3`}>
            <h4 className={`${head} text-accent`}>{c.task}</h4>
            <p className="text-[15px]">{card.task}</p>
            <input value={task} onChange={(e) => setTask(e.target.value.slice(0, 200))} placeholder={c.taskPlaceholder} lang="en"
              className="min-h-11 rounded-xl border border-line bg-white px-3 text-[15px]" aria-label={c.task} />
          </section>

          {again ? (
            <section className={`${block} rounded-xl border border-line bg-white px-3.5 py-3`} data-testid="card-again">
              <h4 className={head}>{c.againTitle}</h4>
              <p className="font-semibold">{again.core}</p>
              {again.examples.map((e, i) => (
                <div key={i}>
                  <p lang="en">{e.en}</p>
                  <p className="text-sm text-muted">{e.vi}</p>
                </div>
              ))}
              <p className="text-[15px]">{again.task}</p>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSave} disabled={save !== "idle"} data-testid="card-save"
              className="min-h-11 rounded-xl bg-accent px-4 font-bold text-white disabled:opacity-80">
              {save === "busy" ? c.saving : save === "saved" ? c.saved : save === "already" ? c.already : c.save}
            </button>
            {askId && !again ? (
              <button type="button" onClick={onAgain} disabled={againBusy} data-testid="card-again-button"
                className="min-h-11 rounded-xl border border-line bg-white px-4">
                {againBusy ? c.againBusy : c.again}
              </button>
            ) : null}
            {askId ? (
              <span role="group" aria-label={c.rateAria} className="ml-auto flex gap-1">
                {(["good", "ok", "confused"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => onRate(v)} aria-label={c.rateLabel[v]} aria-pressed={rating === v} data-testid={`rate-${v}`}
                    className={`min-h-11 min-w-11 rounded-xl text-xl ${rating === v ? "bg-[#e3ece8] ring-2 ring-accent" : "bg-white"}`}>
                    {c.rate[v]}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
          {hasVoice === false && (card.ipa.uk || card.ipa.us) ? <p className="text-sm text-muted" data-testid="no-voice">{c.noVoice}</p> : null}
          {problem ? <p role="alert" className="text-sm text-[#8a2f12]">{problem}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
