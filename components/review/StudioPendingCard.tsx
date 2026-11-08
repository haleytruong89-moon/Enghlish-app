// components/review/StudioPendingCard.tsx
"use client";

import { useRef, useState } from "react";
import { studioCopy, studioInboxCopy } from "@/lib/copy/vi";
import { formatDay } from "@/lib/review/format";
import { sendJson } from "@/lib/studio/client";
import type { PendingAttempt } from "@/lib/studio/types";
import { studioErrorText } from "@/lib/studio/view";
import { formatHm } from "@/lib/work/view";

type Verdict = "correct" | "incorrect";

/** One attempt with items waiting (board 21): Đúng / Sai per item, then Lưu. Adults only. */
export function StudioPendingCard({ attempt }: { attempt: PendingAttempt }) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const clientId = useRef(crypto.randomUUID());
  async function save() {
    const items = Object.entries(verdicts).map(([item_id, result]) => ({ item_id, result }));
    if (items.length === 0) return;
    setBusy(true);
    const r = await sendJson<{ pending: number; result: { recorded: boolean; correct: number | null; in_app: number | null } }>(
      `/api/review/studio/attempts/${attempt.attemptId}`, "POST", { items, client_id: clientId.current });
    setBusy(false);
    if (!r.ok) return setLine(studioErrorText(r.error));
    clientId.current = crypto.randomUUID();
    if (r.body.result.recorded && r.body.result.correct !== null && r.body.result.in_app !== null) {
      setDone(true);
      setLine(studioInboxCopy.doneLine(attempt.alias, r.body.result.correct, r.body.result.in_app));
    } else {
      setLine(studioInboxCopy.partialLine(r.body.pending));
    }
  }
  return (
    <li id={`studio-${attempt.attemptId}`} data-testid={`studio-card-${attempt.attemptId}`} className="scroll-mt-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">{attempt.alias} · {attempt.title}</h2>
      <p className="text-sm text-muted">
        {studioInboxCopy.submitted(`${formatHm(attempt.submittedAt)} ${formatDay(attempt.submittedAt.slice(0, 10))}`)} · {studioInboxCopy.attempt(attempt.attemptNo)} ·{" "}
        <span data-testid={`studio-wait-${attempt.attemptId}`}>{studioInboxCopy.waiting(attempt.waitingDays)}</span>
      </p>
      {done ? null : (
        <ul className="mt-3 flex flex-col gap-3">
          {attempt.items.map((i) => (
            <li key={i.itemId} className="flex flex-col gap-1 rounded-xl border border-line p-3" data-testid={`studio-item-${attempt.attemptId}-${i.itemId}`}>
              <p className="font-semibold">{studioCopy.itemLabel(i.n)}. <span lang="en" className="font-normal">{i.stem}</span></p>
              <p className="text-sm">{studioInboxCopy.expected}: <span lang="en">{i.expected ?? "—"}</span>{i.accepted.length ? <> · {studioInboxCopy.accepted}: <span lang="en">{i.accepted.join(" / ")}</span></> : null}</p>
              <p className="text-sm">{studioInboxCopy.wrote(attempt.alias)}: <span lang="en" className="font-semibold">{i.given || studioInboxCopy.blankAnswer}</span></p>
              <div className="mt-1 flex gap-2" role="radiogroup" aria-label={studioCopy.itemLabel(i.n)}>
                {(["correct", "incorrect"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={verdicts[i.itemId] === v} data-testid={`verdict-${attempt.attemptId}-${i.itemId}-${v}`}
                    onClick={() => setVerdicts((x) => ({ ...x, [i.itemId]: v }))}
                    className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${verdicts[i.itemId] === v ? "border-accent bg-[#E3ECE8] text-[#1F4439]" : "border-line bg-white"}`}>
                    {v === "correct" ? studioInboxCopy.correct : studioInboxCopy.incorrect}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {done ? null : (
        <button type="button" disabled={busy || Object.keys(verdicts).length === 0} onClick={() => void save()} data-testid={`studio-save-${attempt.attemptId}`} className="mt-3 min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-50">
          {busy ? studioInboxCopy.saving : studioInboxCopy.save}
        </button>
      )}
      {line ? <p role="status" data-testid={`studio-line-${attempt.attemptId}`} className="mt-3 text-sm">{line}</p> : null}
    </li>
  );
}
