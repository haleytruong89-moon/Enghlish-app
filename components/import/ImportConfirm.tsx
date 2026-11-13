"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { importCopy } from "@/lib/copy/vi";
import { importErrorText, sendJson } from "@/lib/import/client";
import { isDuplicate, isOpen, manualRow, openCount, rowTid, sortForReview, summaryOf, toConfirmRows, toReviewRows, type ReviewRow } from "@/lib/import/review";
import type { ImportPageData } from "@/lib/import/shape";
import { IMPORT_LIMITS, type ReadResult } from "@/lib/import/types";

const markBtn = "min-h-11 min-w-16 rounded-lg border px-3 text-sm font-semibold";

/**
 * "Xem và xác nhận bài nạp" (wide screen): one row per question. The tutor marks Đúng / Sai / Bỏ trống where the AI was unsure ("Cần xem" first),
 * picks a tag from the CLOSED list for rows without one, and can drop a row. Nothing is confirmed in one tap: the button stays off until every row
 * is dealt with. A parent reads the draft; only the child's tutor confirms (the server and the database check again).
 */
export function ImportConfirm({ data, learnerId }: { data: ImportPageData; learnerId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewRow[]>(() => toReviewRows(data.import.payload?.items ?? []));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // The rows live only in this browser until the tutor confirms: leaving the page loses them, so the pattern guards them.
  const { state: saveState, run } = useSaveStatus(rows);
  const clientId = useRef(crypto.randomUUID());
  const left = openCount(rows);
  const sum = summaryOf(rows);
  const ordered = useMemo(() => sortForReview(rows), [rows]);
  const canConfirm = data.is_tutor && !done;

  const patch = (idx: number, p: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.idx === idx ? { ...r, ...p } : r)));
  // "Thêm câu": a row typed in by the tutor (Soạn tay, or a question the AI missed).
  const [add, setAdd] = useState({ n: "", part: "", student: "", key: "", tag: "", paper: false });
  const addN = Number(add.n);
  const canAdd = canConfirm && Number.isInteger(addN) && addN >= 1 && addN <= 999 && add.tag !== "" && rows.length < IMPORT_LIMITS.questions;
  function addRow() {
    if (!canAdd) return;
    setRows((rs) => [...rs, manualRow(rs.reduce((m, r) => Math.max(m, r.idx + 1), 0), { n: addN, part: add.part.slice(0, IMPORT_LIMITS.part), studentAnswer: add.student, keyAnswer: add.key, tag: add.tag, outOfApp: add.paper })]);
    setAdd((a) => ({ n: String(addN + 1), part: a.part, student: "", key: "", tag: a.tag, paper: false }));
  }

  async function confirm() {
    if (left > 0 || busy) return;
    setBusy(true);
    setProblem(null);
    let failed: string | null = null;
    const ok = await run(async () => {
      const r = await sendJson<{ template_id: string }>(`/api/imports/${data.import.id}/confirm`, "POST", {
        base_updated_at: data.import.updatedAt, rows: toConfirmRows(rows), client_id: clientId.current,
      });
      if (!r.ok) {
        failed = importErrorText(r.error);
        return { ok: false };
      }
      return { ok: true };
    });
    setBusy(false);
    if (!ok) return setProblem(failed);
    setDone(true);
    router.refresh();
  }

  async function discard() {
    setBusy(true);
    const r = await sendJson(`/api/imports/${data.import.id}/discard`, "POST", {});
    setBusy(false);
    if (!r.ok) return setProblem(importErrorText(r.error));
    router.push(`/learners/${learnerId}/knowledge`);
  }

  return (
    <div data-testid="import-confirm">
      {data.is_tutor ? null : <p className="mt-2 text-sm text-muted">{importCopy.parentNote}</p>}
      <p className="mt-2 max-w-3xl text-sm">{importCopy.confirmIntro}</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-3 py-2">{importCopy.cols.n}</th>
              <th className="px-3 py-2">{importCopy.cols.student}</th>
              <th className="px-3 py-2">{importCopy.cols.key}</th>
              <th className="px-3 py-2">{importCopy.cols.result}</th>
              <th className="px-3 py-2">{importCopy.cols.tag}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr key={r.idx} data-testid={`import-row-${rowTid(r, rows)}`} data-manual={r.manual ? "true" : "false"} data-open={isOpen(r, rows) ? "true" : "false"} data-dropped={r.dropped ? "true" : "false"} className={`border-b border-line align-top ${r.dropped ? "opacity-50" : ""} ${isOpen(r, rows) ? "bg-[#FBF1DC]" : ""}`}>
                <td className="px-3 py-2 font-semibold">
                  {r.n}
                  {r.part ? <span className="ml-1 text-xs font-normal text-muted">{r.part}</span> : null}
                  {isDuplicate(r, rows) ? <span className="ml-2 text-xs font-semibold text-[#6B4600]" data-testid={`import-dup-${rowTid(r, rows)}`}>{importCopy.duplicateRow}</span> : null}
                </td>
                <td className="px-3 py-2">
                  {r.studentAnswer ?? <span className="text-muted">{r.lowConfidence ? importCopy.unreadable : importCopy.blankAnswer}</span>}
                  {r.lowConfidence ? <span className="ml-2 rounded-full border border-[#B4690E] px-2 py-0.5 text-xs text-[#6B4600]">{importCopy.low}</span> : null}
                </td>
                <td className="px-3 py-2">{r.keyAnswer ?? <span className="text-muted">{importCopy.noKey}</span>}</td>
                <td className="px-3 py-2">
                  {r.dropped ? null : r.outOfApp ? (
                    <span className="text-xs text-muted">{importCopy.outOfApp}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${importCopy.cols.result} ${r.n}`}>
                      {r.result === "needs_person" ? <span className="mr-1 text-xs font-semibold text-[#6B4600]">{importCopy.needsPerson}</span> : null}
                      {([["correct", importCopy.mark.correct], ["incorrect", importCopy.mark.wrong], ["blank", importCopy.mark.blank]] as [ReadResult, string][]).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          disabled={!canConfirm}
                          aria-pressed={r.result === v}
                          data-testid={`import-mark-${rowTid(r, rows)}-${v}`}
                          onClick={() => patch(r.idx, { result: v })}
                          className={`${markBtn} ${r.result === v ? "border-accent bg-accent text-white" : "border-line bg-white"} disabled:opacity-60`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.dropped ? null : (
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      <span className="sr-only">{importCopy.tag}</span>
                      <select
                        value={r.tag}
                        disabled={!canConfirm}
                        data-testid={`import-tag-${rowTid(r, rows)}`}
                        onChange={(e) => patch(r.idx, { tag: e.target.value })}
                        className="min-h-11 max-w-[16rem] rounded-lg border border-line bg-white px-2 text-sm text-ink"
                      >
                        <option value="">{importCopy.tagNone}</option>
                        {data.context.tags.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canConfirm ? (
                    <div className="flex flex-col gap-1">
                      <label className="flex min-h-11 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={r.outOfApp}
                          disabled={r.dropped}
                          data-testid={`import-paper-${rowTid(r, rows)}`}
                          onChange={(e) => patch(r.idx, e.target.checked ? { outOfApp: true, prevResult: r.result, result: "blank" } : { outOfApp: false, result: r.prevResult ?? r.result })}
                        />
                        {importCopy.outOfApp}
                      </label>
                      <button type="button" data-testid={`import-drop-${rowTid(r, rows)}`} onClick={() => patch(r.idx, { dropped: !r.dropped })} className="min-h-11 text-left text-xs text-accent underline">
                        {r.dropped ? importCopy.restoreRow : importCopy.dropRow}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{importCopy.outOfAppHint}</p>
      {data.import.payload?.items.length === 0 && rows.length === 0 ? <p className="mt-3 text-sm" data-testid="import-manual-empty">{importCopy.manualEmpty}</p> : null}
      {canConfirm ? (
        <fieldset className="mt-4 rounded-2xl border border-line bg-white p-4" data-testid="import-add">
          <legend className="px-1 text-sm font-semibold">{importCopy.addRow}</legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              {importCopy.cols.n}
              <input inputMode="numeric" value={add.n} onChange={(e) => setAdd({ ...add, n: e.target.value.replace(/\D/g, "").slice(0, 3) })} data-testid="import-add-n" className="min-h-11 w-20 rounded-lg border border-line px-2 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {importCopy.addPart}
              <input value={add.part} maxLength={IMPORT_LIMITS.part} onChange={(e) => setAdd({ ...add, part: e.target.value })} data-testid="import-add-part" className="min-h-11 w-28 rounded-lg border border-line px-2 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {importCopy.cols.student}
              <input value={add.student} maxLength={IMPORT_LIMITS.answer} onChange={(e) => setAdd({ ...add, student: e.target.value })} data-testid="import-add-student" className="min-h-11 w-44 rounded-lg border border-line px-2 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {importCopy.cols.key}
              <input value={add.key} maxLength={IMPORT_LIMITS.answer} onChange={(e) => setAdd({ ...add, key: e.target.value })} data-testid="import-add-key" className="min-h-11 w-44 rounded-lg border border-line px-2 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {importCopy.tag}
              <select value={add.tag} onChange={(e) => setAdd({ ...add, tag: e.target.value })} data-testid="import-add-tag" className="min-h-11 max-w-[14rem] rounded-lg border border-line bg-white px-2 text-sm text-ink">
                <option value="">{importCopy.tagNone}</option>
                {data.context.tags.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input type="checkbox" checked={add.paper} onChange={(e) => setAdd({ ...add, paper: e.target.checked })} data-testid="import-add-paper" />
              {importCopy.outOfApp}
            </label>
            <button type="button" disabled={!canAdd} onClick={addRow} data-testid="import-add-btn" className="min-h-11 rounded-lg border border-accent px-4 text-sm font-semibold text-accent disabled:opacity-60">
              {importCopy.addRowBtn}
            </button>
          </div>
        </fieldset>
      ) : null}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-1 py-3" data-testid="import-bar">
        <p className="text-sm font-semibold" data-testid="import-left">
          {importCopy.left(left)}
        </p>
        <p className="text-sm text-muted">{importCopy.summary(sum.correct, sum.counted)}</p>
        {problem ? (
          <p role="alert" data-testid="import-confirm-problem" className="w-full rounded-xl bg-[#FBF1DC] px-3.5 py-2 text-sm text-[#6B4600]">
            {problem}
          </p>
        ) : null}
        {done ? (
          <p role="status" data-testid="import-done" className="font-semibold text-accent">
            {importCopy.confirmed}
          </p>
        ) : null}
        <SaveStatus state={saveState} />
        <div className="ml-auto flex flex-wrap gap-2">
          {done ? (
            <>
              <Link href={`/learners/${learnerId}/knowledge`} data-testid="import-go-map" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white">
                {importCopy.confirmedGo}
              </Link>
              <Link href="/review/skills" data-testid="import-go-skills" className="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-sm font-semibold text-accent">
                {importCopy.confirmedPending}
              </Link>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void discard()} data-testid="import-discard" className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-60">
                {importCopy.discard}
              </button>
              {data.is_tutor ? (
                <button type="button" disabled={busy || left > 0} onClick={() => void confirm()} data-testid="import-confirm-btn" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? importCopy.confirming : importCopy.confirm}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
