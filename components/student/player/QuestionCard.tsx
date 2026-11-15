import { playerCopy as c, work } from "@/lib/copy/vi";
import type { ItemView } from "@/lib/work/types";

const isChoice = (it: ItemView) => it.options.length > 0 && ["mcq", "gap", "word_form"].includes(it.kind);

/** One question: the printed number, what to do, the stem and the answer control. The answer is a controlled value of the player. */
export function QuestionCard({ item, number, value, onChange, onCommit, children }: { item: ItemView; number: number; value: string; onChange: (v: string) => void; onCommit?: () => void; children?: React.ReactNode }) {
  const type = isChoice(item) ? c.choice : item.kind === "open" || item.kind === "transform" || item.kind === "short" ? c.short : c.gap;
  return (
    <section aria-labelledby="qlabel" data-testid={`question-${item.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="qlabel" className="text-sm font-semibold text-muted">
          {c.questionOf(number)} · {type}
        </h2>
        {children}
      </div>
      <p lang="en" className="text-[19px] font-semibold leading-snug">
        {item.stem}
      </p>
      {isChoice(item) ? (
        <div role="radiogroup" aria-labelledby="qlabel" className="flex flex-col gap-2">
          {item.options.map((o) => (
            <label key={o} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3.5 text-[16px] has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
              <input type="radio" name={`q-${item.id}`} value={o} checked={value === o} onChange={() => { onChange(o); onCommit?.(); }} className="h-5 w-5 accent-[#2B5D4F]" />
              <span lang="en">{o}</span>
            </label>
          ))}
        </div>
      ) : item.kind === "open" || item.kind === "transform" ? (
        <textarea
          aria-label={`${work.answerLabel} — ${work.questionLabel(number)}`}
          rows={item.kind === "open" ? 6 : 3}
          value={value}
          placeholder={work.answerHint}
          maxLength={item.kind === "open" ? 20000 : 2000}
          lang="en"
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className="min-h-12 rounded-xl border border-line bg-white px-3 py-2 text-[16px]"
        />
      ) : (
        <input
          type="text"
          aria-label={`${work.answerLabel} — ${work.questionLabel(number)}`}
          value={value}
          placeholder={work.answerHint}
          maxLength={2000}
          lang="en"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className="min-h-12 rounded-xl border border-line bg-white px-3 text-[16px]"
        />
      )}
    </section>
  );
}
