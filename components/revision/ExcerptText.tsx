import { segmentsFor } from "@/lib/revision/excerpt";

/** The child's old text with the excerpts of the numbered items marked (underline + tint + number: never colour alone). */
export function ExcerptText({ text, items }: { text: string; items: { n: number; excerpt: string | null }[] }) {
  return (
    <p lang="en" className="whitespace-pre-wrap text-[15px] leading-relaxed">
      {segmentsFor(text, items).map((s, i) =>
        s.n === null ? (
          <span key={i}>{s.text}</span>
        ) : (
          <mark key={i} data-testid={`excerpt-${s.n}`} className="rounded bg-[#FBF1DC] px-0.5 text-[#3D2A00] underline decoration-2 underline-offset-2">
            {s.text}
            <sup className="ml-0.5 text-xs font-bold">{s.n}</sup>
          </mark>
        ),
      )}
    </p>
  );
}
