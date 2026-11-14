"use client";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { roadmapCopy, tutorHonorific } from "@/lib/copy/vi";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { roadmapFailText } from "@/lib/roadmap/client";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import { MILESTONE_KINDS, type MilestoneVersion } from "@/lib/roadmap/types";
import { fieldsOf, type FormValues } from "@/lib/roadmap/view";
import { postJson } from "@/lib/tutorwork/client";

const field = "min-h-11 rounded-lg border border-line bg-white px-3";

/**
 * Add / edit one milestone (also "Sửa rồi xác nhận" of a proposal). "Lưu và xác nhận" = the child sees it; "Lưu nháp" = the child does not
 * (or keeps seeing the older confirmed version). The browser sends the facts only; the SQL checks Unit, summit and version again.
 */
export function MilestoneForm({
  learnerId, curricula, mainId, initial, editing, proposalKey, summitTitle, onDone, onCancel,
}: {
  learnerId: string;
  curricula: RoadmapCurriculum[];
  mainId: string | null;
  initial: FormValues;
  /** The milestone being edited (its current version), or null for a new one. */
  editing: MilestoneVersion | null;
  proposalKey?: string;
  /** Title of the summit the child sees now, for the "Đã có đỉnh" message. */
  summitTitle?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const { state, track } = useSaveStatus(v);
  const curriculumId = v.curriculumId ?? mainId;
  const units = curricula.find((c) => c.id === curriculumId)?.units ?? [];
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((cur) => ({ ...cur, [k]: val }));

  async function save(status: "draft" | "confirmed") {
    setError(null);
    if (v.title.trim() === "") return setError(roadmapCopy.errors.bad_fields!);
    const fields = fieldsOf({ ...v, curriculumId });
    if (fields === null) return setError(roadmapCopy.errors.bad_fields!);
    const r = await track(() =>
      postJson(`/api/learners/${learnerId}/roadmap/milestones`, {
        client_id: clientId.current, status, fields,
        ...(editing ? { milestone_id: editing.milestoneId, base_version: editing.version } : {}),
        ...(proposalKey ? { proposal_key: proposalKey } : {}),
      }),
    );
    if (!r.ok) {
      clientId.current = crypto.randomUUID();
      return setError(r.error === "summit_exists" && summitTitle ? `${roadmapCopy.errors.summit_exists} (${summitTitle})` : roadmapFailText(r));
    }
    onDone();
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} onKeyDown={blockImplicitSubmit} data-testid="milestone-form" className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-white p-4">
      <h3 className="text-base font-semibold">{editing ? roadmapCopy.form.editTitle(editing.version + 1) : roadmapCopy.form.addTitle}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{roadmapCopy.form.kind}</span>
          <select value={v.kind} onChange={(e) => set("kind", e.target.value as FormValues["kind"])} data-testid="ms-kind" className={field}>
            {MILESTONE_KINDS.map((k) => <option key={k} value={k}>{roadmapCopy.kinds[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{roadmapCopy.form.role}</span>
          <select value={v.role} onChange={(e) => set("role", e.target.value as FormValues["role"])} data-testid="ms-role" className={field}>
            {(["flag", "summit", "beyond"] as const).map((r) => <option key={r} value={r}>{roadmapCopy.roles[r]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">{roadmapCopy.form.name}</span>
          <input type="text" maxLength={80} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder={roadmapCopy.form.namePlaceholder} data-testid="ms-title" className={field} />
        </label>
        {v.role === "flag" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{roadmapCopy.form.unit}</span>
            <select
              value={v.afterUnit ?? ""}
              disabled={units.length === 0}
              onChange={(e) => setV((cur) => ({ ...cur, afterUnit: e.target.value === "" ? null : e.target.value, curriculumId: e.target.value === "" ? cur.curriculumId : curriculumId }))}
              data-testid="ms-unit"
              className={field}
            >
              <option value="">{units.length === 0 ? roadmapCopy.form.noCurriculum : roadmapCopy.form.noUnit}</option>
              {units.map((u) => <option key={u.code} value={u.code}>{roadmapCopy.form.unitOption(u.code, u.title)}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{roadmapCopy.form.month}</span>
          <input type="text" inputMode="numeric" maxLength={7} value={v.month} onChange={(e) => set("month", e.target.value)} placeholder={roadmapCopy.form.monthPlaceholder} data-testid="ms-month" className={field} />
          <span className="text-xs text-muted">{roadmapCopy.form.monthHint}</span>
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={v.approx} onChange={(e) => set("approx", e.target.checked)} data-testid="ms-approx" className="size-5" />
        <span>{roadmapCopy.form.approx}</span>
      </label>
      {editing?.status === "confirmed" ? <p className="text-sm text-muted">{roadmapCopy.form.editsConfirmedNote(tutorHonorific)}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700" data-testid="ms-error">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save("confirmed")} data-testid="ms-save-confirm" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white">{roadmapCopy.form.saveConfirm}</button>
        <button type="button" onClick={() => save("draft")} data-testid="ms-save-draft" className="min-h-11 rounded-lg border border-accent bg-white px-5 text-sm font-semibold text-accent">{roadmapCopy.form.saveDraft}</button>
        <button type="button" onClick={onCancel} className="min-h-11 px-3 text-sm text-muted underline">{roadmapCopy.form.cancel}</button>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}
