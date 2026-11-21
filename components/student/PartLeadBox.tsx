import { langOf, type PartLead } from "@/lib/studio/taskParts";

/**
 * The lead of one part above a question (E0): its title when it adds something, the instruction as written, each word bank as a
 * list of word tags. The tags are not buttons (flat, no border), so a child does not try to tap them.
 */
export function PartLeadBox({ lead, testId }: { lead: PartLead; testId: string }) {
  if (!lead.title && !lead.text && lead.banks.length === 0) return null;
  return (
    <div data-testid={testId} className="flex flex-col gap-1.5 rounded-xl bg-[#F4F1EA] px-3.5 py-2.5 text-[15px] leading-snug">
      {lead.title ? <p lang={langOf(lead.title)} className="text-[13px] font-semibold text-muted">{lead.title}</p> : null}
      {lead.text ? <p lang={langOf(lead.text)} className="whitespace-pre-line">{lead.text}</p> : null}
      {lead.banks.map((b, i) => (
        <div key={`${i}-${b.label}`} className="flex flex-wrap items-center gap-1.5" data-testid={`${testId}-bank`}>
          <span lang={langOf(b.label)} className="text-[13px] font-semibold text-muted">{b.label}:</span>
          <ul role="list" aria-label={b.label} lang="en" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {b.words.map((w, j) => (
              <li key={`${j}-${w}`} className="rounded-md bg-[#E7E0CF] px-2 py-0.5 text-[14px]" data-testid={`${testId}-chip`}>
                {w}
                {j < b.words.length - 1 ? <span className="sr-only">, </span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
