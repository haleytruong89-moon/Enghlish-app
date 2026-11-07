// components/studio/ItemCard.tsx
"use client";

import { studioCopy, studioIssueText } from "@/lib/copy/vi";
import { tagOf, type StudioContext } from "@/lib/studio/context";
import { STUDIO_ITEM_KINDS, type StudioItem, type StudioPart, type StudioPassage } from "@/lib/studio/schema";
import type { Issue } from "@/lib/studio/validate";

const field = "min-h-11 rounded-lg border border-line bg-white px-3 text-[15px]";

/** One item of board 19. `onChange` gets a patch; the editor keeps the draft. */
export function ItemCard({
  item, parts, passages, context, issues, onChange, onRemove,
}: {
  item: StudioItem; parts: StudioPart[]; passages: StudioPassage[]; context: StudioContext; issues: Issue[];
  onChange: (patch: Partial<StudioItem>) => void; onRemove: () => void;
}) {
  const tagValue = item.reading_skill_key ?? item.tag_key ?? "";
  const reading = context.tags.filter((t) => t.reading);
  const near = context.tags.filter((t) => !t.reading && t.near);
  const far = context.tags.filter((t) => !t.reading && !t.near);
  function pickTag(key: string) {
    const t = tagOf(context, key || null);
    if (!t) return onChange({ tag_key: null, reading_skill_key: null });
    if (!t.reading) return onChange({ tag_key: t.key, reading_skill_key: null });
    const skill = item.target_id ?? t.related.find((id) => context.skills.some((s) => s.id === id)) ?? null;
    onChange({ reading_skill_key: t.key, tag_key: null, target_id: skill });
  }
  return (
    <li data-testid={`item-${item.n}`} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{studioCopy.itemLabel(item.n)}</strong>
        {issues.filter((i) => i.blocking).map((i) => (
          <span key={i.code} data-testid={`issue-${item.n}-${i.code}`} className="rounded-full bg-[#F8D7D3] px-2 py-0.5 text-xs font-semibold text-[#8A1C12]">
            {studioIssueText[i.code]}
          </span>
        ))}
        {item.needs_review ? (
          <span className="rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs text-[#6B4600]" title={item.review_reason ?? undefined}>
            {studioCopy.needsReview}
            {item.review_reason ? `: ${item.review_reason}` : ""}
          </span>
        ) : null}
        <button type="button" onClick={onRemove} className="ml-auto min-h-11 text-sm text-muted underline">{studioCopy.removeItem}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.number}
          <input type="number" min={1} max={300} value={item.n} onChange={(e) => onChange({ n: Number(e.target.value) })} className={field} />
        </label>
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.part}
          <select value={item.part} onChange={(e) => onChange({ part: e.target.value })} className={field}>
            {parts.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.kind}
          <select value={item.kind} onChange={(e) => onChange({ kind: e.target.value as StudioItem["kind"], options: e.target.value === "mcq" ? item.options : [] })} className={field}>
            {STUDIO_ITEM_KINDS.map((k) => <option key={k} value={k}>{studioCopy.kinds[k]}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={item.out_of_app} onChange={(e) => onChange({ out_of_app: e.target.checked })} className="h-5 w-5" />
        {studioCopy.outOfApp}
      </label>
      <label className="flex flex-col text-xs font-semibold">
        {studioCopy.stem}
        <textarea lang="en" rows={2} value={item.stem} onChange={(e) => onChange({ stem: e.target.value })} className={`${field} py-2`} />
      </label>
      {item.kind === "mcq" ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-semibold">{studioCopy.options}</legend>
          {item.options.map((o, k) => (
            <div key={k} className="flex gap-2">
              <input aria-label="letter" value={o.letter} maxLength={1} onChange={(e) => onChange({ options: item.options.map((x, j) => (j === k ? { ...x, letter: e.target.value.toUpperCase() } : x)) })} className={`${field} w-14`} />
              <input lang="en" value={o.text} onChange={(e) => onChange({ options: item.options.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} className={`${field} flex-1`} />
            </div>
          ))}
          <button type="button" className="self-start text-sm text-accent underline" onClick={() => onChange({ options: [...item.options, { letter: String.fromCharCode(65 + item.options.length), text: "" }] })}>
            {studioCopy.addOption}
          </button>
        </fieldset>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-semibold">
          {item.kind === "mcq" ? studioCopy.keyMcq : studioCopy.key}
          <input lang="en" data-testid={`item-${item.n}-key`} value={item.key ?? ""} onChange={(e) => onChange({ key: e.target.value.trim() ? e.target.value : null })} className={field} />
        </label>
        {item.kind !== "mcq" ? (
          <label className="flex flex-col text-xs font-semibold">
            {studioCopy.accepted}
            <textarea lang="en" rows={2} placeholder={studioCopy.acceptedHint} value={item.accepted.join("\n")} onChange={(e) => onChange({ accepted: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} className={`${field} py-2`} />
          </label>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.tag}
          <select data-testid={`item-${item.n}-tag`} value={tagValue} onChange={(e) => pickTag(e.target.value)} className={field}>
            <option value="">{studioCopy.pickTag}</option>
            {[["reading", reading], ["near", near], ["far", far]].map(([g, list]) =>
              (list as typeof reading).length ? (
                <optgroup key={g as string} label={g === "reading" ? (reading[0]?.group ?? "") : g === "near" ? studioCopy.tag : `${studioCopy.tag} …`}>
                  {(list as typeof reading).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </optgroup>
              ) : null,
            )}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.skill}
          <select data-testid={`item-${item.n}-skill`} value={item.target_id ?? ""} onChange={(e) => onChange({ target_id: e.target.value || null })} className={field}>
            <option value="">{studioCopy.noSkill}</option>
            {context.skills.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold">
          {studioCopy.passageOfItem}
          <select value={item.passage_ref ?? ""} onChange={(e) => onChange({ passage_ref: e.target.value || null })} className={field}>
            <option value="">{studioCopy.noPassage}</option>
            {passages.map((p) => <option key={p.ref} value={p.ref}>{p.ref} — {p.title}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col text-xs font-semibold">
        {studioCopy.explanation}
        <textarea rows={2} maxLength={300} value={item.explanation_vi} onChange={(e) => onChange({ explanation_vi: e.target.value })} className={`${field} py-2`} />
      </label>
    </li>
  );
}
