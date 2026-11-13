"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { NonUnitList } from "@/components/curriculum/NonUnitList";
import { AddTag } from "@/components/tutor/AddTag";
import { TagSelect } from "@/components/tutor/TagSelect";
import { useTags } from "@/components/tutor/useTags";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { curriculumCopy, nonUnitCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import { buildTocContext } from "@/lib/curriculum/context";
import { editStats, tooManyEdits } from "@/lib/curriculum/editStats";
import type { CurriculumPayload, UnitDraft } from "@/lib/curriculum/schema";
import type { VersionPageData } from "@/lib/curriculum/shape";
import { EDIT_REASONS, IGNORED_REASONS, QUALITY, UNIT_CODE_RE, type EditReason, type IgnoredReason, type Quality } from "@/lib/curriculum/types";
import { moveToNonUnit, moveToUnit, nonUnitFull, relatedUnits, restoreUnit, unitsFull } from "@/lib/curriculum/rows";
import { rowsToResolve, validateCurriculum, type CurriculumIssue } from "@/lib/curriculum/validate";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-sm";
const small = "min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:border-accent";

/**
 * "Duyệt mục lục" (spec §5 desktop rules 1, 4, 7): wide page, rows that block first, a sticky bar at the bottom ("Còn n dòng cần xử lý ·
 * Duyệt"), "Đóng" at the top. Every change is local until "Lưu nháp"; "Duyệt" needs a saved draft with nothing left to resolve and is
 * shown to the child's tutor only (D-W8). Rows the tutor drops stay in the draft (marked) so the edit count stays honest.
 */
export function VersionReview({ initial, map, tags: initialTags, learnerId }: { initial: VersionPageData; map: SkillMapView; tags: TagInfo[]; learnerId: string }) {
  const router = useRouter();
  const v = initial.version;
  const { tags, add } = useTags(learnerId, initialTags);
  const [payload, setPayload] = useState<CurriculumPayload>(v.payload);
  const [base, setBase] = useState(v.updatedAt);
  const { state: saveState, dirty, run } = useSaveStatus(payload, { savedAt: v.updatedAt });
  const [busy, setBusy] = useState<"save" | "approve" | "discard" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [qualityNote, setQualityNote] = useState("");
  const ctx = useMemo(() => buildTocContext(map, tags), [map, tags]);
  const issues = useMemo(() => validateCurriculum(payload, ctx), [payload, ctx]);
  const left = rowsToResolve(issues);
  const stats = editStats(v.aiPayload, payload);
  const labelOf = new Map(tags.map((t) => [t.key, t.label]));
  const blocked = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  const rows = payload.units.map((u, i) => ({ u, i }));
  const firstRows = rows.filter((r) => !r.u.dropped && blocked.has(r.u.code));
  const restRows = rows.filter((r) => !r.u.dropped && !blocked.has(r.u.code));
  const droppedRows = rows.filter((r) => r.u.dropped);

  function update(i: number, patch: Partial<UnitDraft>) {
    setPayload((p) => ({ ...p, units: p.units.map((u, k) => (k === i ? { ...u, ...patch } : u)) }));
  }
  const notAUnit = (i: number, reason: IgnoredReason) => {
    if (nonUnitFull(payload)) return setProblem(nonUnitCopy.listFull);
    setProblem(null);
    setPayload((p) => moveToNonUnit(p, i, reason));
  };
  const backToUnit = (k: number) => {
    if (unitsFull(payload)) return setProblem(nonUnitCopy.unitsFull);
    setProblem(null);
    setPayload((p) => moveToUnit(p, k));
  };
  function addUnit() {
    setPayload((p) => {
      const used = new Set(p.units.map((u) => u.code));
      let n = p.units.length + 1;
      while (used.has(`U${n}`)) n += 1;
      const unit: UnitDraft = {
        code: `U${n}`, title: curriculumCopy.newUnitTitle, section: null, page: null, skipped: false, points: [], missing_points: [], needs_review: false,
        review_reason: null, flags: [], origin: "manual", ai_index: null, dropped: false, edit_reason: null,
      };
      return { ...p, units: [...p.units, unit] };
    });
  }
  /** Returns the new lock value, or null when the save failed. */
  async function save(): Promise<string | null> {
    setBusy("save");
    setProblem(null);
    let lock: string | null = null;
    const ok = await run(async () => {
      const r = await sendJson<{ updated_at: string }>(`/api/curricula/versions/${v.id}`, "PUT", { payload, base_updated_at: base });
      if (!r.ok) {
        setProblem(curriculumErrorText(r.error));
        return { ok: false };
      }
      lock = r.body.updated_at;
      return { ok: true, savedAt: r.body.updated_at };
    });
    setBusy(null);
    if (!ok || lock === null) return null;
    setBase(lock);
    return lock;
  }
  async function approve() {
    // Unsaved changes are saved first; the approval then uses the NEW lock value (state updates are not visible in this closure).
    const lock = dirty ? await save() : base;
    if (lock === null) return;
    setBusy("approve");
    const r = await sendJson(`/api/curricula/versions/${v.id}/approve`, "POST", { base_updated_at: lock, quality, quality_note: qualityNote.trim() || null });
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.refresh();
  }
  async function discard() {
    if (!window.confirm(curriculumCopy.discardConfirm)) return;
    setBusy("discard");
    const r = await sendJson(`/api/curricula/versions/${v.id}/discard`, "POST");
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/learners/${learnerId}/curricula`);
  }

  const rowView = ({ u, i }: { u: UnitDraft; i: number }) => (
    <UnitRow
      key={i}
      u={u}
      issues={issues.filter((x) => x.code === u.code)}
      map={map}
      tags={tags}
      labelOf={labelOf}
      onChange={(patch) => update(i, patch)}
      onNotUnit={(reason) => notAUnit(i, reason)}
      onAdd={add}
    />
  );

  return (
    <div className="pb-40" data-testid="curriculum-review">
      <p className="text-sm text-muted">{curriculumCopy.summary(payload.units.filter((u) => !u.dropped).length, payload.ignored.length)}</p>
      {stats ? (
        <p className="mt-1 text-sm" data-testid="review-stats">
          {curriculumCopy.stats(stats)}
        </p>
      ) : null}
      {tooManyEdits(stats) ? (
        <p role="status" className="mt-2 rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="review-too-many-edits">
          {curriculumCopy.tooManyEdits}
        </p>
      ) : null}

      {firstRows.length > 0 ? (
        <section className="mt-5 flex flex-col gap-2" aria-label={curriculumCopy.needsTitle(firstRows.length)} data-testid="review-needs">
          <h2 className="text-base font-semibold">{curriculumCopy.needsTitle(firstRows.length)}</h2>
          <p className="text-sm text-muted">{curriculumCopy.needsHint}</p>
          {firstRows.map(rowView)}
        </section>
      ) : null}

      <section className="mt-6 flex flex-col gap-2" aria-label={curriculumCopy.allTitle} data-testid="review-rest">
        <h2 className="text-base font-semibold">{curriculumCopy.allTitle}</h2>
        {restRows.map(rowView)}
        <button type="button" onClick={addUnit} data-testid="review-add-unit" className={`${small} self-start`}>
          {curriculumCopy.addUnit}
        </button>
      </section>

      {droppedRows.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line bg-white p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">{curriculumCopy.droppedBadge} ({droppedRows.length})</summary>
          {droppedRows.map(({ u, i }) => (
            <p key={i} className="flex flex-wrap items-center gap-3 py-1 text-sm">
              <span className="text-muted line-through">
                {u.code} · {u.title}
              </span>
              <button type="button" className={small} onClick={() => setPayload((p) => restoreUnit(p, i))} data-testid={`row-undrop-${i}`}>
                {curriculumCopy.undrop}
              </button>
            </p>
          ))}
        </details>
      ) : null}

      <NonUnitList rows={payload.ignored} mode="draft" onToUnit={backToUnit} related={payload.ignored.map((_, k) => relatedUnits(payload, k))} />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur" data-testid="review-bar">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3">
          <p className={`font-semibold ${left > 0 ? "text-[#8A1C12]" : "text-accent"}`} data-testid="review-left">
            {curriculumCopy.barLeft(left)}
          </p>
          {v.source === "ai" && initial.is_tutor ? (
            <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0 text-sm">
              <legend className="sr-only">{curriculumCopy.quality}</legend>
              <span className="text-muted">{curriculumCopy.quality}</span>
              {QUALITY.map((q) => (
                <button key={q} type="button" aria-pressed={quality === q} onClick={() => setQuality(quality === q ? null : q)} data-testid={`review-quality-${q}`}
                  className={`min-h-11 rounded-full border px-3 ${quality === q ? "border-accent bg-accent text-white" : "border-line bg-white"}`}>
                  {curriculumCopy.qualityOptions[q]}
                </button>
              ))}
              <input value={qualityNote} onChange={(e) => setQualityNote(e.target.value)} maxLength={200} placeholder={curriculumCopy.qualityNote} aria-label={curriculumCopy.qualityNote} className={`${input} w-64`} />
            </fieldset>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveStatus state={saveState} />
            {problem ? <span role="alert" className="text-sm text-[#8A1C12]" data-testid="review-problem">{problem}</span> : null}
            <button type="button" disabled={busy !== null} onClick={() => void discard()} data-testid="review-discard" className={small}>
              {curriculumCopy.discard}
            </button>
            <button type="button" disabled={busy !== null || !dirty} onClick={() => void save()} data-testid="review-save" className={small}>
              {busy === "save" ? curriculumCopy.saving : curriculumCopy.save}
            </button>
            {initial.is_tutor ? (
              <button type="button" disabled={busy !== null || left > 0} onClick={() => void approve()} data-testid="review-approve"
                className="min-h-12 rounded-xl bg-accent px-6 font-bold text-white disabled:opacity-50">
                {busy === "approve" ? curriculumCopy.approving : curriculumCopy.approve}
              </button>
            ) : (
              <span className="text-sm text-muted" data-testid="review-approve-tutor-only">{curriculumCopy.approveTutorOnly}</span>
            )}
          </div>
        </div>
      </div>
      <Link href={`/learners/${learnerId}/curricula`} className="sr-only">
        {curriculumCopy.close}
      </Link>
    </div>
  );
}

function UnitRow({
  u, issues, map, tags, labelOf, onChange, onNotUnit, onAdd,
}: {
  u: UnitDraft;
  issues: CurriculumIssue[];
  map: SkillMapView;
  tags: TagInfo[];
  labelOf: Map<string, string>;
  onChange: (patch: Partial<UnitDraft>) => void;
  onNotUnit: (reason: IgnoredReason) => void;
  onAdd: ReturnType<typeof useTags>["add"];
}) {
  const [making, setMaking] = useState<string | null>(null);
  const id = `row-${u.code}`;
  const blockingText = issues.filter((x) => x.blocking).map((x) => curriculumCopy.issueText[x.issue]);
  return (
    <div className={`grid gap-3 rounded-xl border bg-white p-3 lg:grid-cols-[6rem_minmax(0,2fr)_8rem_5rem_minmax(0,3fr)] ${blockingText.length ? "border-[#E9C46A]" : "border-line"}`} data-testid={id}>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.code}
        <input value={u.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) })} aria-invalid={!UNIT_CODE_RE.test(u.code)} className={input} data-testid={`${id}-code`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.title}
        <input value={u.title} maxLength={160} onChange={(e) => onChange({ title: e.target.value })} className={input} data-testid={`${id}-title`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.section}
        <input value={u.section ?? ""} maxLength={40} onChange={(e) => onChange({ section: e.target.value.trim() ? e.target.value : null })} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.page}
        <input inputMode="numeric" value={u.page ?? ""} onChange={(e) => { const n = Number(e.target.value); onChange({ page: e.target.value && Number.isInteger(n) && n >= 1 && n <= 3000 ? n : null }); }} className={input} />
      </label>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs text-muted">{curriculumCopy.col.points}</span>
        <div className="flex flex-wrap gap-2">
          {u.points.map((k) => (
            <button key={k} type="button" onClick={() => onChange({ points: u.points.filter((x) => x !== k) })} aria-label={curriculumCopy.removePoint(labelOf.get(k) ?? k)}
              className="min-h-9 rounded-full border border-accent bg-white px-3 text-sm" data-testid={`${id}-point-${k}`}>
              {labelOf.get(k) ?? k} ×
            </button>
          ))}
        </div>
        {u.points.length < 12 ? (
          <TagSelect tags={tags.filter((t) => !u.points.includes(t.key))} map={map} value={null} onChange={(k) => k && onChange({ points: [...u.points, k] })} onAdd={onAdd} label={curriculumCopy.addPoint} testId={`${id}-add-point`} />
        ) : null}
      </div>
      {u.flags.length > 0 || u.review_reason || u.missing_points.length > 0 || blockingText.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm lg:col-span-5">
          {u.flags.length > 0 ? <p className="text-[#6B4600]">{u.flags.map((f) => curriculumCopy.flags[f]).join(" · ")}</p> : null}
          {u.review_reason ? <p className="text-muted">{u.review_reason}</p> : null}
          {u.missing_points.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">{curriculumCopy.missingHint}</span>
              {u.missing_points.map((m) => (
                <button key={m} type="button" className={small} onClick={() => setMaking(m)} data-testid={`${id}-make-${m}`}>
                  {curriculumCopy.makeTag(m)}
                </button>
              ))}
            </div>
          ) : null}
          {making ? (
            <AddTag map={map} prefill={making} onAdd={async (label, group) => {
              const r = await onAdd(label, group);
              if ("key" in r) {
                onChange({ points: u.points.includes(r.key) ? u.points : [...u.points, r.key], missing_points: u.missing_points.filter((x) => x !== making) });
                setMaking(null);
              }
              return r;
            }} />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 lg:col-span-5">
        {u.needs_review ? (
          <button type="button" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => onChange({ needs_review: false })} data-testid={`${id}-seen`}>
            {curriculumCopy.markSeen}
          </button>
        ) : null}
        <button type="button" className={small} aria-pressed={u.skipped} onClick={() => onChange({ skipped: !u.skipped })} data-testid={`${id}-skip`}>
          {u.skipped ? curriculumCopy.unskip : curriculumCopy.skip}
        </button>
        <button type="button" className={small} onClick={() => onChange({ dropped: true })} data-testid={`${id}-drop`}>
          {curriculumCopy.drop}
        </button>
        <select
          value=""
          aria-label={nonUnitCopy.notUnit}
          onChange={(e) => e.target.value && onNotUnit(e.target.value as IgnoredReason)}
          className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm"
          data-testid={`${id}-notunit`}
        >
          <option value="">{nonUnitCopy.notUnitPick}</option>
          {IGNORED_REASONS.map((r) => (
            <option key={r} value={r}>
              {curriculumCopy.ignoredReasons[r]}
            </option>
          ))}
        </select>
        {u.origin === "ai" ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            {curriculumCopy.reasonLabel}
            <select value={u.edit_reason ?? ""} onChange={(e) => onChange({ edit_reason: (e.target.value || null) as EditReason | null })} className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm" data-testid={`${id}-reason`}>
              <option value="">—</option>
              {EDIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {curriculumCopy.reasons[r]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {u.skipped ? <span className="rounded-full bg-line px-2.5 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
        {blockingText.length > 0 ? <span className="text-xs font-semibold text-[#8A1C12]">{blockingText.join(" · ")}</span> : null}
      </div>
    </div>
  );
}
