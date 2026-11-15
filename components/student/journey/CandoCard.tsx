import { candoCopy as c } from "@/lib/copy/vi";
import type { CandoItem } from "@/lib/student/cando";
import { ddmm } from "@/lib/student/week";

/** "Những điều mình đã làm được" (W4e · Q17): one card per skill / knowledge item the tutor confirmed. Words and a date only; the newest says "Mới". */
export function CandoCard({ items }: { items: readonly CandoItem[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="cando-title" data-testid="cando-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="cando-title" className="text-lg font-semibold">{c.title}</h2>
          <p className="text-sm text-muted">{c.note}</p>
        </div>
        {items.length > 0 ? <span className="rounded-full bg-[#E3ECE8] px-3 py-1 text-sm font-semibold text-[#1F4439]" data-testid="cando-count">{c.count(items.length)}</span> : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted" data-testid="cando-empty">{c.empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${i.isNew ? "border-2 border-accent/50 bg-[#F1F6F3]" : "border-line bg-white"}`} data-testid="cando-item" data-new={i.isNew ? "yes" : "no"}>
              <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-accent/40 bg-[#E3ECE8] text-[#1F4439]">✓</span>
              <div className="min-w-0">
                <p className="break-words font-semibold"><span className="font-normal text-muted">{c.lead}</span> {i.text}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {i.isNew ? <strong className="text-[#1F4439]">{c.newTag}</strong> : null}
                  {i.isNew ? " · " : null}
                  {c.confirmedBy} <time dateTime={i.date}>{ddmm(i.date)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
