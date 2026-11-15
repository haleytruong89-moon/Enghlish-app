import Link from "next/link";
import type { ReactNode } from "react";
import { submitScreenCopy as copy } from "@/lib/copy/vi";

/** One numbered step of a submit screen (a check mark once it is done). */
export function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "active" | "later"; children: ReactNode }) {
  const mark = state === "done" ? "✓" : String(n);
  const cls = state === "done" ? "bg-accent text-white" : state === "active" ? "border-2 border-accent bg-white text-accent" : "border border-line bg-white text-muted";
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-white p-4" data-testid={`step-${n}`} data-state={state}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${cls}`} aria-hidden="true">
        {mark}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

/** What the child sees once the work is sent. */
export function SentPanel() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-[#e3ece8] p-5 text-[#1d4136]" data-testid="submit-done" role="status">
      <h2 className="text-xl font-bold">{copy.doneTitle}</h2>
      <p>{copy.doneNote}</p>
      <Link href="/" className="inline-flex min-h-12 items-center self-start rounded-xl bg-accent px-6 font-bold text-white no-underline" data-testid="submit-home">
        {copy.doneBack}
      </Link>
    </section>
  );
}

/** The child cannot send any more: an adult has looked at this work. */
export function ReviewedPanel() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" data-testid="submit-reviewed">
      <p className="text-lg">{copy.reviewed}</p>
      <Link href="/" className="inline-flex min-h-12 items-center self-start rounded-xl border border-accent px-6 font-semibold text-accent no-underline">
        {copy.backLabel}
      </Link>
    </section>
  );
}
