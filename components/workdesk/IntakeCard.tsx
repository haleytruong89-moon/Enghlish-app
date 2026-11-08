"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { intakeCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { DomainKey } from "@/lib/skillmap/types";
import { INTAKE_GOALS_MAX, INTAKE_TEXT_MAX, type IntakeView } from "@/lib/workdesk/types";

type Dom = { key: DomainKey; name: string };
type Goal = { title: string; due: string };

/** "Hồ sơ đầu vào" (W1): goals + starting strengths / weaknesses by domain, written by the child's tutor; every save is a new row. */
export function IntakeCard({ learnerId, view, canEdit, domains }: { learnerId: string; view: IntakeView | null; canEdit: boolean; domains: Dom[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [strengths, setStrengths] = useState<Partial<Record<DomainKey, string>>>({});
  const [weaknesses, setWeaknesses] = useState<Partial<Record<DomainKey, string>>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const start = () => {
    setGoals((view?.goals ?? []).map((g) => ({ title: g.title, due: g.due ?? "" })));
    setStrengths({ ...(view?.strengths ?? {}) });
    setWeaknesses({ ...(view?.weaknesses ?? {}) });
    setNote(view?.note ?? "");
    setMsg(null);
    setEditing(true);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson(`/api/learners/${learnerId}/intake`, {
      goals: goals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), due: g.due.trim() || null })),
      strengths,
      weaknesses,
      note: note.trim(),
      client_id: crypto.randomUUID(),
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: failText(r) });
    setEditing(false);
    setMsg({ ok: true, text: intakeCopy.saved });
    router.refresh();
  }

  const domainColumn = (title: string, values: Partial<Record<DomainKey, string>>, set: (v: Partial<Record<DomainKey, string>>) => void, id: string) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{title}</legend>
      <p className="text-xs text-muted">{intakeCopy.byDomainHint}</p>
      {domains.map((d) => (
        <label key={d.key} className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{d.name}</span>
          <input id={`${id}_${d.key}`} value={values[d.key] ?? ""} maxLength={INTAKE_TEXT_MAX} onChange={(e) => set({ ...values, [d.key]: e.target.value })} className="min-h-11 rounded-lg border border-line bg-white px-3" />
        </label>
      ))}
    </fieldset>
  );

  const readColumn = (title: string, values: Partial<Record<DomainKey, string>>, testid: string) => (
    <div data-testid={testid}>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">
        {domains.filter((d) => values[d.key]).map((d) => (
          <li key={d.key}>
            <span className="text-muted">{d.name}: </span>
            {values[d.key]}
          </li>
        ))}
        {domains.every((d) => !values[d.key]) ? <li className="text-muted">—</li> : null}
      </ul>
    </div>
  );

  return (
    <section id="intake" className="mt-6 scroll-mt-4 rounded-xl border border-line bg-white p-5" data-testid="intake-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{intakeCopy.title}</h2>
        {canEdit && !editing ? (
          <button type="button" onClick={start} data-testid="intake-edit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent">
            {view ? intakeCopy.edit : intakeCopy.fill}
          </button>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-4 flex flex-col gap-5" data-testid="intake-form">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{intakeCopy.goals}</legend>
            {goals.map((g, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                  <span className="text-muted">{intakeCopy.goalTitle}</span>
                  <input value={g.title} maxLength={INTAKE_TEXT_MAX} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="min-h-11 rounded-lg border border-line bg-white px-3" />
                </label>
                <label className="flex w-36 flex-col gap-1 text-sm">
                  <span className="text-muted">{intakeCopy.goalDue}</span>
                  <input value={g.due} maxLength={20} placeholder="06/2027" onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} className="min-h-11 rounded-lg border border-line bg-white px-3" />
                </label>
                <button type="button" aria-label={intakeCopy.removeGoal(g.title || String(i + 1))} onClick={() => setGoals(goals.filter((_, j) => j !== i))} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm">
                  ×
                </button>
              </div>
            ))}
            {goals.length < INTAKE_GOALS_MAX ? (
              <button type="button" data-testid="intake-add-goal" onClick={() => setGoals([...goals, { title: "", due: "" }])} className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-medium">
                {intakeCopy.addGoal}
              </button>
            ) : null}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            {domainColumn(intakeCopy.strengths, strengths, setStrengths, "in_s")}
            {domainColumn(intakeCopy.weaknesses, weaknesses, setWeaknesses, "in_w")}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{intakeCopy.note}</span>
            <textarea rows={2} maxLength={INTAKE_TEXT_MAX * 2} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} data-testid="intake-save" className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? intakeCopy.saving : intakeCopy.save}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-line bg-white px-5 text-sm font-medium">
              {intakeCopy.cancel}
            </button>
          </div>
        </form>
      ) : view ? (
        <div className="mt-3 flex flex-col gap-4">
          <div data-testid="intake-goals">
            <h3 className="text-sm font-medium">{intakeCopy.goals}</h3>
            {view.goals.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{intakeCopy.noGoals}</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {view.goals.map((g, i) => (
                  <li key={i}>{g.due ? `${g.title} · ${g.due}` : g.title}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {readColumn(intakeCopy.strengths, view.strengths, "intake-strengths")}
            {readColumn(intakeCopy.weaknesses, view.weaknesses, "intake-weaknesses")}
          </div>
          {view.note ? <p className="whitespace-pre-wrap text-sm">{view.note}</p> : null}
          <p className="text-xs text-muted">{intakeCopy.recorded(formatDateVi(view.at), view.authorName)}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted" data-testid="intake-empty">
          {intakeCopy.empty}
        </p>
      )}
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} data-testid="intake-msg" className={`mt-3 text-sm font-medium ${msg.ok ? "text-accent" : "text-[#7a2a0c]"}`}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
