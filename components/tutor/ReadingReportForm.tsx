"use client";

import { BusyButton } from "@/components/ui/BusyButton";
import { busyCopy } from "@/lib/copy/vi";import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readingPage } from "@/lib/copy/vi";
import { buildReadingRows, type ReadingCell } from "@/lib/reading/rows";
import type { ReadingReportEdit } from "@/lib/reading/types";
import { failText, postJson } from "@/lib/tutorwork/client";

type Cell = ReadingCell;

/** One row per reading skill of the child's track: "Số câu" + "% đúng". Empty row = no question that month. Staff only. */
export function ReadingReportForm({ learnerId, tags, month, existing }: {
  learnerId: string;
  tags: { key: string; label: string }[];
  month: string; // YYYY-MM-01
  existing: ReadingReportEdit | null;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const t of tags) {
      const r = existing?.rows.find((x) => x.tagKey === t.key);
      m[t.key] = r ? { q: String(r.questions), pct: String(r.correctPct) } : { q: "", pct: "" };
    }
    return m;
  }, [tags, existing]);
  const [cells, setCells] = useState(initial);
  const [note, setNote] = useState(existing?.note ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId] = useState(() => crypto.randomUUID());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = buildReadingRows(tags, cells);
    if (r === null) return setMsg({ ok: false, text: readingPage.rowInvalid });
    if (r.length === 0) return setMsg({ ok: false, text: readingPage.needOneRow });
    setBusy(true);
    const res = await postJson(`/api/learners/${learnerId}/reading-reports`, {
      client_id: clientId, month, rows: r, ...(note.trim() ? { note: note.trim() } : {}), ...(existing ? { supersedes_id: existing.id } : {}),
    });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: failText(res) });
    setMsg({ ok: true, text: readingPage.saved });
    router.push(`/learners/${learnerId}/weak?domain=reading`);
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="reading-form">
      {existing ? <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">{readingPage.editing(month.slice(0, 7))}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">{readingPage.colSkill}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colQuestions}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colPct}</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.key} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{t.label}</td>
                {(["q", "pct"] as const).map((f) => (
                  <td key={f} className="px-4 py-2">
                    <input
                      inputMode="numeric"
                      aria-label={`${t.label} · ${f === "q" ? readingPage.colQuestions : readingPage.colPct}`}
                      data-testid={`reading-${f}-${t.key}`}
                      value={cells[t.key]![f]}
                      onChange={(e) => setCells((c) => ({ ...c, [t.key]: { ...c[t.key]!, [f]: e.target.value.trim() } }))}
                      className="min-h-11 w-20 rounded-lg border border-line px-3"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {readingPage.noteLabel}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="rounded-lg border border-line px-3 py-2" data-testid="reading-note" />
      </label>
      {msg ? <p role="status" className={msg.ok ? "text-accent" : "text-[#8a3b12]"} data-testid="reading-msg">{msg.text}</p> : null}
      <BusyButton busy={busy} busyLabel={busyCopy.saving} type="submit"  className="min-h-11 self-start rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-60" data-testid="reading-save">
        {existing ? readingPage.saveCorrection : readingPage.save}
      </BusyButton>
    </form>
  );
}
