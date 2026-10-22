"use client";

import { feedbackCopy } from "@/lib/copy/vi";
import { EXCERPT_MAX, ITEM_MAX, MAX_ITEMS, PRAISE_MAX, type FeedbackDraftItem } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { LeafPicker } from "./LeafPicker";

export type FeedbackDraft = { praise: string; items: FeedbackDraftItem[] };
export const emptyItem = (): FeedbackDraftItem => ({ text: "", excerpt: "", leaf: null });

/** The items as the API takes them: trimmed text, excerpt only when given, leaf as {kind, ref_key}. */
export function feedbackPayloadItems(items: FeedbackDraftItem[]) {
  return items.map((i) => ({
    text: i.text.trim(),
    ...(i.excerpt.trim() ? { excerpt: i.excerpt.trim() } : {}),
    ...(i.leaf ? { leaf: { kind: i.leaf.kind, ref_key: i.leaf.refKey } } : {}),
  }));
}

const box = "min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-[15px]";

/** Praise + 1–3 items (text, excerpt from the work, optional skill). Controlled: the parent owns the state and the submit. */
export function FeedbackFields({ value, onChange, map, testIdPrefix }: { value: FeedbackDraft; onChange: (v: FeedbackDraft) => void; map: SkillMapView | null; testIdPrefix: string }) {
  const setItem = (i: number, patch: Partial<FeedbackDraftItem>) =>
    onChange({ ...value, items: value.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  // The text selected in the work beside the panel (WorkPanel / before–after view) becomes the excerpt.
  const takeSelection = (i: number) => {
    const sel = typeof window === "undefined" ? "" : (window.getSelection()?.toString() ?? "");
    if (sel.trim()) setItem(i, { excerpt: sel.trim().slice(0, EXCERPT_MAX) });
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{feedbackCopy.praiseLabel}</span>
        <span className="text-muted">{feedbackCopy.praiseHint}</span>
        <textarea rows={2} maxLength={PRAISE_MAX} value={value.praise} onChange={(e) => onChange({ ...value, praise: e.target.value })}
          data-testid={`${testIdPrefix}-praise`} className={box} />
      </label>
      {value.items.map((it, i) => (
        <fieldset key={i} className="m-0 flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`${testIdPrefix}-item-${i + 1}`}>
          <legend className="px-1 text-sm font-semibold">{feedbackCopy.itemLabel(i + 1)}</legend>
          <textarea aria-label={feedbackCopy.itemLabel(i + 1)} rows={2} maxLength={ITEM_MAX} placeholder={feedbackCopy.itemHint} value={it.text}
            onChange={(e) => setItem(i, { text: e.target.value })} data-testid={`${testIdPrefix}-item-${i + 1}-text`} className={box} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{feedbackCopy.excerptLabel}</span>
            <div className="flex flex-wrap gap-2">
              <input type="text" lang="en" aria-label={feedbackCopy.excerptLabel} maxLength={EXCERPT_MAX} value={it.excerpt}
                onChange={(e) => setItem(i, { excerpt: e.target.value })} data-testid={`${testIdPrefix}-item-${i + 1}-excerpt`}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3" />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => takeSelection(i)} data-testid={`${testIdPrefix}-item-${i + 1}-take`}
                className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm">
                {feedbackCopy.takeSelection}
              </button>
            </div>
            <span className="text-xs text-muted">{feedbackCopy.excerptHint}</span>
          </div>
          {map ? <LeafPicker map={map} value={it.leaf} onChange={(leaf) => setItem(i, { leaf })} testIdPrefix={`${testIdPrefix}-item-${i + 1}-leaf`} /> : null}
          {value.items.length > 1 ? (
            <button type="button" onClick={() => onChange({ ...value, items: value.items.filter((_, k) => k !== i) })}
              className="min-h-11 self-start text-sm text-accent underline">
              {feedbackCopy.removeItem}
            </button>
          ) : null}
        </fieldset>
      ))}
      {value.items.length < MAX_ITEMS ? (
        <button type="button" onClick={() => onChange({ ...value, items: [...value.items, emptyItem()] })} data-testid={`${testIdPrefix}-add`}
          className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
          {feedbackCopy.addItem}
        </button>
      ) : null}
    </div>
  );
}
