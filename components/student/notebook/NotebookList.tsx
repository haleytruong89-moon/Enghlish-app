"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { notebookCopy as c, tutorPageCopy } from "@/lib/copy/vi";
import type { NotebookRow } from "@/lib/student/notebook";

/** The Vietnamese calendar day of a timestamp (UTC+7), "23/11". */
function vnDay(ts: string): string {
  const d = new Date(new Date(ts).getTime() + 7 * 3600_000);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Sổ tay · Từ vựng (E2a): newest first, a filter on this device, "Bỏ khỏi Sổ tay" with a confirmation, removed words folded under
 * "Đã bỏ (n)" with "Thêm lại". Only counts of words are shown (data-count="work").
 */
export function NotebookList({ rows: initial }: { rows: NotebookRow[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const q = filter.trim().toLowerCase();
  const match = (r: NotebookRow) => !q || r.headword.includes(q) || (r.meaning ?? "").toLowerCase().includes(q);
  const active = useMemo(() => rows.filter((r) => r.state === "active"), [rows]);
  const removed = useMemo(() => rows.filter((r) => r.state === "removed"), [rows]);
  const shown = active.filter(match);

  async function set(itemId: string, action: "remove" | "restore") {
    setBusy(itemId);
    setProblem(null);
    try {
      const res = await fetch(`/api/student/notebook/${itemId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProblem(tutorPageCopy.errors[body?.error ?? ""] ?? tutorPageCopy.errors.network!);
        return;
      }
      setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, state: action === "remove" ? "removed" : "active" } : r)));
      setConfirm(null);
    } catch {
      setProblem(tutorPageCopy.errors.network!);
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) return <p className="rounded-2xl border border-line bg-white p-4" data-testid="notebook-empty">{c.empty}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="notebook-list">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="sr-only">{c.filter}</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={c.filterPlaceholder} className="min-h-11 rounded-xl border border-line px-3.5" data-testid="notebook-filter" />
        </label>
        <span className="text-sm text-muted">
          <span data-count="work">{active.length}</span> {c.count(active.length).replace(/^\d+\s*/, "")}
        </span>
      </div>
      {problem ? <p role="alert" className="text-sm text-[#8a2f12]">{problem}</p> : null}
      {shown.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
          {shown.map((r) => (
            <li key={r.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid={`nb-${r.headword}`}>
              <Link href={`/tutor/card/${r.cardId}?from=notebook`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center no-underline">
                <span className="font-bold text-ink" lang="en">{r.headword}</span>
                {r.meaning ? <span className="text-sm text-muted">{r.meaning}</span> : null}
              </Link>
              <span className="text-xs text-muted">{c.savedOn(vnDay(r.savedAt))}</span>
              {confirm === r.itemId ? (
                <span className="flex items-center gap-2" role="group" aria-label={c.removeConfirm}>
                  <span className="text-sm">{c.removeConfirm}</span>
                  <button type="button" onClick={() => void set(r.itemId, "remove")} disabled={busy === r.itemId} className="min-h-11 rounded-xl bg-[#8a2f12] px-3 font-semibold text-white" data-testid={`nb-yes-${r.headword}`}>{c.yes}</button>
                  <button type="button" onClick={() => setConfirm(null)} className="min-h-11 rounded-xl border border-line px-3">{c.no}</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm(r.itemId)} className="min-h-11 rounded-xl border border-line px-3 text-sm" data-testid={`nb-remove-${r.headword}`}>{c.remove}</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{active.length ? c.noMatch : c.empty}</p>
      )}
      {removed.length ? (
        <details className="rounded-2xl border border-line bg-white px-4 py-2" data-testid="notebook-removed">
          <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold">{c.removed(removed.length)}</summary>
          <ul className="flex flex-col gap-2 pb-2">
            {removed.map((r) => (
              <li key={r.itemId} className="flex items-center justify-between gap-3">
                <span lang="en">{r.headword}</span>
                <button type="button" onClick={() => void set(r.itemId, "restore")} disabled={busy === r.itemId} className="min-h-11 rounded-xl border border-line px-3 text-sm" data-testid={`nb-restore-${r.headword}`}>{c.restore}</button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
