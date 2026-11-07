import { sessionNotePage } from "@/lib/copy/vi";

/** Live "Đã chọn n" line + the chosen skills as chips with a remove button. Pure presentation: the form owns the state. */
export function PractisedChosen({
  chosen,
  onRemove,
  testId,
}: {
  chosen: { id: string; title: string }[];
  onRemove: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={`${testId}-chosen`}>
      <p className="text-sm font-medium" role="status" data-testid={`${testId}-count`}>
        {sessionNotePage.practisedChosen(chosen.length)}
      </p>
      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full border border-accent bg-white pl-3 text-sm text-accent">
              <span>{c.title}</span>
              <button
                type="button"
                aria-label={sessionNotePage.practisedRemove(c.title)}
                onClick={() => onRemove(c.id)}
                data-testid={`${testId}-remove-${c.id}`}
                className="min-h-11 min-w-11 rounded-full text-base"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
