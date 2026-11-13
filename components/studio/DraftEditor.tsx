// components/studio/DraftEditor.tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { studioCopy, studioIssueText } from "@/lib/copy/vi";
import { sendJson } from "@/lib/studio/client";
import type { DraftPageData } from "@/lib/studio/types";
import type { StudioDraft, StudioItem } from "@/lib/studio/schema";
import { sortForReview, summarizeDraft } from "@/lib/studio/summary";
import { blockingIssues, validateDraft } from "@/lib/studio/validate";
import { studioErrorText } from "@/lib/studio/view";
import { ItemCard } from "./ItemCard";
import { SidePanel } from "./SidePanel";

/** Board 19: edit every item, part skill, reading texts; save with the optimistic lock; Duyệt only without blocking issues. */
export function DraftEditor({ initial }: { initial: DraftPageData }) {
  const router = useRouter();
  const { context } = initial;
  const [title, setTitle] = useState(initial.draft.title);
  const [d, setD] = useState<StudioDraft>(initial.draft.payload);
  const [base, setBase] = useState(initial.draft.updatedAt);
  const { state: saveState, dirty, run } = useSaveStatus({ title, d }, { savedAt: initial.draft.updatedAt });
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const issues = useMemo(() => validateDraft(d, context), [d, context]);
  const blocking = blockingIssues(issues);
  const summary = summarizeDraft(d, issues);
  const flagged = new Set(issues.filter((i) => i.n !== null).map((i) => i.n as number));

  const change = (next: StudioDraft) => {
    setD(next);
  };
  const upd = (n: number, patch: Partial<StudioItem>) => change({ ...d, items: d.items.map((i) => (i.n === n ? { ...i, ...patch } : i)) });
  const partSkill = (part: string, target: string | null) =>
    change({ ...d, items: d.items.map((i) => (i.part === part && !i.out_of_app ? { ...i, target_id: target } : i)) });
  const addItem = (part: string) => {
    const n = Math.max(0, ...d.items.map((i) => i.n)) + 1;
    change({
      ...d,
      items: [...d.items, { n, part, kind: "gap", out_of_app: false, stem: "", options: [], passage_ref: null, key: null, accepted: [], tag_key: null, target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null }],
    });
  };
  const addPart = () => {
    const key = String.fromCharCode(65 + d.parts.length);
    change({ ...d, parts: [...d.parts, { key, name: key, instructions: "" }] });
  };

  async function save(): Promise<string | null> {
    setBusy(true);
    setMsg(null);
    let at: string | null = null;
    const ok = await run(async () => {
      const r = await sendJson<{ updated_at: string }>(`/api/studio/drafts/${initial.draft.id}`, "PUT", { title, payload: d, base_updated_at: base });
      if (!r.ok) {
        setMsg(studioErrorText(r.error));
        return { ok: false };
      }
      at = r.body.updated_at;
      return { ok: true, savedAt: r.body.updated_at };
    });
    setBusy(false);
    if (!ok || at === null) return null;
    setBase(at);
    return at;
  }
  async function approve() {
    const at = dirty ? await save() : base;
    if (!at) return;
    setBusy(true);
    const r = await sendJson<{ template_id: string }>(`/api/studio/drafts/${initial.draft.id}/approve`, "POST", { base_updated_at: at });
    setBusy(false);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    router.refresh();
  }
  async function discard() {
    const r = await sendJson(`/api/studio/drafts/${initial.draft.id}/discard`, "POST", {});
    if (r.ok) router.refresh();
    else setMsg(studioErrorText(r.error));
  }

  const ordered = sortForReview(d.items, issues).filter((i) => !onlyFlagged || flagged.has(i.n));
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {studioCopy.titleLabel}
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className="min-h-11 rounded-lg border border-line px-3 font-normal" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="only-flagged" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="h-5 w-5" />
          {studioCopy.onlyFlagged}
        </label>
        {blocking.filter((i) => i.n === null).map((i) => (
          <p key={i.code} role="alert" data-testid={`issue-draft-${i.code}`} className="rounded-xl bg-[#F8D7D3] px-3.5 py-3 text-sm text-[#8A1C12]">
            {studioIssueText[i.code]}
          </p>
        ))}
        {d.parts.map((p, pi) => {
          const items = ordered.filter((i) => i.part === p.key);
          return (
            <section key={p.key} aria-labelledby={`part-${p.key}`} data-testid={`part-${p.key}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <h2 id={`part-${p.key}`} className="text-lg font-semibold">{studioCopy.part} {p.key}</h2>
                <input aria-label={studioCopy.partName} value={p.name} onChange={(e) => change({ ...d, parts: d.parts.map((x, j) => (j === pi ? { ...x, name: e.target.value } : x)) })} className="min-h-11 flex-1 rounded-lg border border-line px-3" />
                <label className="flex flex-col text-xs font-semibold">
                  {studioCopy.partSkill}
                  <select data-testid={`part-${p.key}-skill`} defaultValue="__" onChange={(e) => e.target.value !== "__" && partSkill(p.key, e.target.value || null)} className="min-h-11 rounded-lg border border-line px-3">
                    <option value="__">{studioCopy.partSkillApply}</option>
                    <option value="">{studioCopy.noSkill}</option>
                    {context.skills.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              <textarea lang="en" aria-label={studioCopy.partInstructions} rows={2} value={p.instructions} onChange={(e) => change({ ...d, parts: d.parts.map((x, j) => (j === pi ? { ...x, instructions: e.target.value } : x)) })} className="rounded-lg border border-line px-3 py-2 text-sm" />
              <ul className="flex flex-col gap-3">
                {items.map((i) => (
                  <ItemCard key={i.n} item={i} parts={d.parts} passages={d.passages} context={context} issues={issues.filter((x) => x.n === i.n)}
                    onChange={(patch) => upd(i.n, patch)} onRemove={() => change({ ...d, items: d.items.filter((x) => x.n !== i.n) })} />
                ))}
              </ul>
              <button type="button" onClick={() => addItem(p.key)} className="self-start text-sm text-accent underline">{studioCopy.addItem}</button>
            </section>
          );
        })}
        <button type="button" onClick={addPart} className="self-start text-sm text-accent underline">{studioCopy.addPart}</button>
        <section aria-labelledby="passages" className="flex flex-col gap-3">
          <h2 id="passages" className="text-lg font-semibold">{studioCopy.passages}</h2>
          {d.passages.map((p, k) => (
            <div key={p.ref} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
              <input aria-label={studioCopy.passageTitle} value={p.title} onChange={(e) => change({ ...d, passages: d.passages.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} className="min-h-11 rounded-lg border border-line px-3" />
              <textarea lang="en" aria-label={studioCopy.passageText} rows={6} value={p.text} onChange={(e) => change({ ...d, passages: d.passages.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} className="rounded-lg border border-line px-3 py-2 text-sm" />
            </div>
          ))}
          <button type="button" onClick={() => change({ ...d, passages: [...d.passages, { ref: `P${d.passages.length + 1}`, title: `P${d.passages.length + 1}`, text: " " }] })} className="self-start text-sm text-accent underline">{studioCopy.addPassage}</button>
        </section>
        {msg ? <p role="status" data-testid="studio-msg" className="text-sm">{msg}</p> : null}
        <SaveStatus state={saveState} />
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void save()} data-testid="studio-save" className="min-h-12 rounded-xl border border-line bg-white px-5 font-semibold">{busy ? studioCopy.saving : studioCopy.save}</button>
          <button type="button" disabled={busy || blocking.length > 0} onClick={() => void approve()} data-testid="studio-approve" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-50">{studioCopy.approve}</button>
          <button type="button" disabled={busy} onClick={() => void discard()} className="min-h-12 px-3 text-sm text-muted underline">{studioCopy.discard}</button>
        </div>
        {blocking.length > 0 ? <p className="text-sm text-[#8A1C12]" data-testid="approve-blocked">{studioCopy.approveBlocked(blocking.length)}</p> : null}
      </div>
      <SidePanel summary={summary} aiCostUsd={initial.draft.aiCostUsd} gate={initial.gate} />
    </div>
  );
}
