"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { tourCopy as c } from "@/lib/copy/vi";
import { TOUR_SEEN_KEY, tourSteps } from "@/lib/tour/steps";

type Box = { top: number; left: number; width: number; height: number };

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never force the tour on every page
  }
}
function writeSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    /* storage blocked: the tour simply shows again next time */
  }
}

/** The element of a step when it is on screen (a folded phone menu hides the left column: then the card sits in the middle). */
function boxOf(testId: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const CARD_W = 340;

/**
 * 27/11 "Hướng dẫn": a short tour of the adult pages. Opens by itself the first time a tutor opens the app on this device (remembered on
 * the device, no SQL); anyone opens it again with the "Hướng dẫn" button in the top bar. Never opens by itself under automation
 * (`navigator.webdriver`), so browser tests are not blocked by it; they open it with the button.
 */
export function Tour({ alias, autoStart }: { alias: string; autoStart: boolean }) {
  const steps = tourSteps(alias);
  const [i, setI] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!autoStart || navigator.webdriver || readSeen()) return;
    // After the first paint, so the shell (and the places the steps point at) are on screen.
    const t = window.setTimeout(() => setI(0), 400);
    return () => window.clearTimeout(t);
  }, [autoStart]);

  const close = useCallback(() => {
    writeSeen();
    setI(null);
    opener.current?.focus();
  }, []);

  const step = i === null ? null : steps[i]!;
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="${step.target}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
    const place = () => setBox(boxOf(step.target));
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

  useEffect(() => {
    if (i === null) return;
    card.current?.querySelector<HTMLButtonElement>("[data-tour-primary]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && card.current) {
        // Keep the keyboard inside the card while it is open (aria-modal).
        const b = [...card.current.querySelectorAll<HTMLButtonElement>("button")];
        const first = b[0], last = b[b.length - 1];
        if (first && last && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (first && last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === "ArrowRight") setI((x) => (x === null ? x : Math.min(x + 1, steps.length - 1)));
      if (e.key === "ArrowLeft") setI((x) => (x === null ? x : Math.max(x - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, close, steps.length]);

  // Card beside the highlighted place (right of the left column, below the top bar); in the middle when there is none or no room.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  let pos: React.CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  if (box) {
    const right = box.left + box.width + 16;
    if (right + CARD_W <= vw - 8) pos = { top: Math.max(8, Math.min(box.top, vh - 260)), left: right };
    else pos = { top: Math.min(box.top + box.height + 12, vh - 260), left: Math.max(8, Math.min(box.left, vw - CARD_W - 8)) };
  }

  return (
    <>
      <button ref={opener} type="button" onClick={() => setI(0)} data-testid="tour-open" aria-label={c.openLabel}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent bg-white px-3 text-sm font-semibold text-accent hover:bg-[#eef5f1]">
        <span aria-hidden="true">?</span> {c.open}
      </button>
      {step ? (
        <div className="fixed inset-0 z-50 print:hidden" data-testid="tour">
          {/* The dim layer is the highlight's shadow, so the highlighted place stays bright; without a place, a plain dim layer. */}
          {box ? (
            <div aria-hidden="true" className="pointer-events-none fixed rounded-xl ring-4 ring-[#f2b705] transition-all"
              style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, boxShadow: "0 0 0 9999px rgba(20,30,25,0.55)" }} />
          ) : (
            <div aria-hidden="true" className="fixed inset-0 bg-[rgba(20,30,25,0.55)]" />
          )}
          <div ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" data-testid={`tour-step-${step.key}`}
            className="fixed flex max-w-[calc(100vw-16px)] flex-col gap-3 rounded-2xl bg-white p-5 shadow-xl" style={{ ...pos, width: CARD_W }}>
            <p className="text-xs font-semibold text-muted">{c.stepOf(i! + 1, steps.length)}</p>
            <h2 id="tour-title" className="text-lg font-bold text-[#1f4439]">{step.title}</h2>
            <p id="tour-body" className="text-sm leading-relaxed">{step.body}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={close} data-testid="tour-skip" className="min-h-11 px-1 text-sm text-muted underline">{c.skip}</button>
              <span className="ml-auto flex gap-2">
                {i! > 0 ? (
                  <button type="button" onClick={() => setI(i! - 1)} data-testid="tour-prev" className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{c.prev}</button>
                ) : null}
                {i! < steps.length - 1 ? (
                  <button type="button" data-tour-primary="" onClick={() => setI(i! + 1)} data-testid="tour-next" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-white">{c.next}</button>
                ) : (
                  <button type="button" data-tour-primary="" onClick={close} data-testid="tour-done" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-white">{c.done}</button>
                )}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
