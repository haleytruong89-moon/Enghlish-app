import { thenNowCopy as c } from "@/lib/copy/vi";
import type { ThenNowView } from "@/lib/student/thenNow";
import { ddmm } from "@/lib/student/week";

/** "Ngày ấy – bây giờ" (W4e · Q16): two pieces of the child's own writing the tutor picked, side by side, with one short note. Hidden when there is no pick. */
export function ThenNowCard({ view }: { view: ThenNowView }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="thennow-title" data-testid="then-now-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="thennow-title" className="text-lg font-semibold">{c.title}</h2>
          <p className="text-sm text-muted">{c.note}</p>
        </div>
        <span className="rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]">{c.chosenBy}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-line bg-white p-4" data-testid="then-piece">
          <p className="text-[13px] font-bold text-muted">{c.thenLabel} <time dateTime={view.then.on}>{ddmm(view.then.on)}</time></p>
          <p className="mt-2 whitespace-pre-wrap break-words font-serif text-[16.5px] leading-relaxed">{view.then.text}</p>
        </article>
        <article className="rounded-xl border border-accent/40 bg-[#F1F6F3] p-4" data-testid="now-piece">
          <p className="text-[13px] font-bold text-[#1F4439]">{c.nowLabel} <time dateTime={view.now.on}>{ddmm(view.now.on)}</time></p>
          <p className="mt-2 whitespace-pre-wrap break-words font-serif text-[16.5px] leading-relaxed">{view.now.text}</p>
        </article>
      </div>
      {view.note ? <p className="mt-3 text-sm" data-testid="then-now-note"><strong>{c.message}</strong> {view.note}</p> : null}
    </section>
  );
}
