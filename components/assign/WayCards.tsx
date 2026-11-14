import Link from "next/link";
import { assignWaysCopy, inquiriesPage, prefillCopy, unitPickerCopy } from "@/lib/copy/vi";
import { RECOMMENDED, WAYS, wayHref, type Way } from "@/lib/assign/ways";
import { formatRange, type Prefill } from "@/lib/prefill";

/** "Từ giáo trình: …" line shared by the chooser (and any page that carries a prefill). */
export function fromBookLine(prefill: Prefill): string | null {
  const parts = [prefill.title, prefill.pages ? prefillCopy.pages(prefill.pages) : null, prefill.units.length > 0 ? prefillCopy.units(formatRange(prefill.units)) : null].filter((x): x is string => Boolean(x));
  return parts.length > 0 ? assignWaysCopy.fromBook(parts.join(unitPickerCopy.sep)) : null;
}

/** The four cards of "Giao bài" (a plain list of links; no card is wrapped in a link, so the topic card keeps its own feedback link). */
export function WayCards({ learnerId, prefill }: { learnerId: string; prefill?: Prefill }) {
  const book = prefill ? fromBookLine(prefill) : null;
  return (
    <div className="flex flex-col gap-3" data-testid="way-cards">
      {book ? (
        <p className="rounded-xl bg-[#eef3ef] px-3.5 py-2 text-sm" data-testid="ways-from-book">
          {book}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {WAYS.map((w: Way) => {
          const rec = w === RECOMMENDED;
          const c = assignWaysCopy.ways[w];
          const note = "note" in c ? c.note : null;
          return (
            <li
              key={w}
              data-testid={`way-${w}`}
              data-recommended={rec ? "true" : "false"}
              className={`flex flex-col gap-2 rounded-2xl border bg-white p-5 ${rec ? "border-2 border-accent" : "border-line"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{c.title}</h2>
                {rec ? <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">{assignWaysCopy.recommended}</span> : null}
              </div>
              {w === "topic" ? (
                <p className="text-sm" data-testid="way-topic-intro">
                  {inquiriesPage.intro.before}
                  <Link href={inquiriesPage.introHref(learnerId)} className="text-accent underline">
                    {inquiriesPage.intro.link}
                  </Link>
                  {inquiriesPage.intro.after}
                </p>
              ) : (
                <p className="text-sm">{"desc" in c ? c.desc : null}</p>
              )}
              {note ? <p className="text-sm text-muted">{note}</p> : null}
              <Link
                href={wayHref(learnerId, w, prefill)}
                data-testid={`way-choose-${w}`}
                className={`inline-flex min-h-11 items-center self-start rounded-xl px-4 text-sm font-semibold no-underline ${rec ? "bg-accent text-white" : "border border-accent text-accent"}`}
              >
                {assignWaysCopy.choose}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
