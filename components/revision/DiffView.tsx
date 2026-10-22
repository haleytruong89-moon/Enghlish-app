import { revisionReviewCopy } from "@/lib/copy/vi";
import { changeCount, diffWords } from "@/lib/revision/diff";

/**
 * Before and after (spec §2 step 5): two columns on a wide screen, one under the other on a phone. Removed words are struck through in the
 * old text, added words are underlined and tinted in the new one, each with a word for screen readers (never colour alone).
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const tokens = diffWords(before, after);
  const { added, removed } = changeCount(tokens);
  return (
    <section className="flex flex-col gap-2" data-testid="diff-view">
      <p className="text-sm text-muted">{added + removed === 0 ? revisionReviewCopy.noChange : revisionReviewCopy.changeLine(added, removed)}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-3" data-testid="diff-before">
          <h4 className="mb-1 text-sm font-semibold text-muted">{revisionReviewCopy.before}</h4>
          <p lang="en" className="whitespace-pre-wrap leading-relaxed">
            {tokens.filter((t) => t.op !== "add").map((t, i) =>
              t.op === "del" ? (
                <del key={i} className="rounded bg-[#FBE3E0] text-[#7A1F14] line-through">
                  <span className="sr-only">{revisionReviewCopy.deletedLabel} </span>
                  {t.text}
                </del>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3" data-testid="diff-after">
          <h4 className="mb-1 text-sm font-semibold text-muted">{revisionReviewCopy.after}</h4>
          <p lang="en" className="whitespace-pre-wrap leading-relaxed">
            {tokens.filter((t) => t.op !== "del").map((t, i) =>
              t.op === "add" ? (
                <ins key={i} className="rounded bg-[#DDEFE3] text-[#14502E] underline decoration-2 underline-offset-2">
                  <span className="sr-only">{revisionReviewCopy.addedLabel} </span>
                  {t.text}
                </ins>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
