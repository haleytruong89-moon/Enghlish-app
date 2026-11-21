import type { PartLead } from "@/lib/studio/taskParts";

/** The lead of one part above a question (E0): its title when it adds something, the instruction once, each word bank as chips. */
export function PartLeadBox({ lead, testId }: { lead: PartLead; testId: string }) {
  if (!lead.title && !lead.text && lead.banks.length === 0) return null;
  return (
    <div lang="en" data-testid={testId} className="flex flex-col gap-1.5 rounded-xl bg-[#F4F1EA] px-3.5 py-2.5 text-[15px] leading-snug">
      {lead.title ? <p className="text-[13px] font-semibold text-muted">{lead.title}</p> : null}
      {lead.text ? <p className="whitespace-pre-line">{lead.text}</p> : null}
      {lead.banks.map((b) => (
        <div key={b.label} className="flex flex-wrap items-center gap-1.5" data-testid={`${testId}-bank`}>
          <span className="text-[13px] font-semibold text-muted">{b.label}:</span>
          {b.words.map((w) => (
            <span key={w} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[14px]" data-testid={`${testId}-chip`}>
              {w}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
