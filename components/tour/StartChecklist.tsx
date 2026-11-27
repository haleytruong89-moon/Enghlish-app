"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { tourCopy } from "@/lib/copy/vi";
import type { StartItem } from "@/lib/tour/checklist";

const c = tourCopy.start;
const hiddenKey = (learnerId: string) => `eos.start.hidden.${learnerId}`;
const EVENT = "eos-start-hidden";

function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(EVENT, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(EVENT, fn);
  };
}
function readHidden(learnerId: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(learnerId)) === "1";
  } catch {
    return false;
  }
}
function setHidden(learnerId: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(hiddenKey(learnerId), "1");
    else window.localStorage.removeItem(hiddenKey(learnerId));
  } catch {
    /* storage blocked: the card just stays */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * 27/11 "Bắt đầu với …" on Hôm nay: six first things to do for a child, each ticked from what is in the app (`startChecklist`). The page
 * leaves it out when all six are done. "Ẩn thẻ này" hides it on this device only (light convenience, no SQL).
 */
export function StartChecklist({ learnerId, alias, items }: { learnerId: string; alias: string; items: StartItem[] }) {
  const hidden = useSyncExternalStore(subscribe, () => readHidden(learnerId), () => false);
  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(learnerId, false)} data-testid="start-show" className="self-start min-h-11 text-sm text-accent underline">
        {c.show}
      </button>
    );
  }
  const done = items.filter((i) => i.done === true).length;
  return (
    <section aria-labelledby="start-title" data-testid="start-checklist" className="rounded-2xl border-2 border-[#f2b705] bg-[#fffaf0] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="start-title" className="text-lg font-bold text-[#1f4439]">{c.title(alias)}</h2>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6B4600]" data-testid="start-progress">{c.progress(done, items.length)}</span>
        <button type="button" onClick={() => setHidden(learnerId, true)} data-testid="start-hide" className="ml-auto min-h-11 px-1 text-sm text-muted underline">{c.hide}</button>
      </div>
      <p className="text-sm text-muted">{c.hint}</p>
      <ol className="mt-2 flex flex-col gap-1">
        {items.map((it, n) => {
          const t = c.items[it.key];
          return (
            <li key={it.key} data-testid={`start-${it.key}`} data-done={it.done === null ? "unknown" : String(it.done)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2">
              <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${it.done ? "bg-accent text-white" : "border-2 border-line text-muted"}`}>
                {it.done ? "✓" : n + 1}
              </span>
              <span className="flex min-w-0 flex-1 basis-60 flex-col">
                <span className={it.done ? "font-semibold text-muted line-through decoration-1" : "font-semibold"}>
                  {t.title}
                  <span className="sr-only">{it.done === true ? " ✓" : ""}</span>
                </span>
                {it.done ? null : <span className="text-sm text-muted">{it.done === null ? c.unknown : t.line}</span>}
              </span>
              {it.done === false ? (
                <Link href={it.href} data-testid={`start-do-${it.key}`} className="inline-flex min-h-11 items-center rounded-xl border-2 border-accent bg-white px-3 text-sm font-bold text-accent no-underline hover:bg-[#eef5f1]">
                  {c.doIt}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
