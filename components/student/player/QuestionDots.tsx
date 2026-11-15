import { playerCopy as c } from "@/lib/copy/vi";
import type { Dot } from "@/lib/student/player";

/** One dot per question: filled = answered, ring = the current one. Buttons (44 px tap area), with a text label, not colour alone. */
export function QuestionDots({ dots, numbers, onGo }: { dots: Dot[]; numbers: number[]; onGo: (i: number) => void }) {
  return (
    <ol aria-label={c.dotsLabel} className="m-0 flex list-none flex-wrap gap-0.5 p-0" data-testid="question-dots">
      {dots.map((d, i) => (
        <li key={d.id}>
          <button
            type="button"
            onClick={() => onGo(i)}
            aria-label={`${d.state === "answered" ? c.dotAnswered(numbers[i]!) : c.dotEmpty(numbers[i]!)} · ${c.gotoQuestion(numbers[i]!)}`}
            aria-current={d.current ? "step" : undefined}
            data-state={d.state}
            className="flex h-11 w-9 items-center justify-center"
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full border-2 ${d.state === "answered" ? "border-accent bg-accent" : "border-line-strong bg-white"} ${d.current ? "ring-2 ring-accent ring-offset-2" : ""}`}
            />
          </button>
        </li>
      ))}
    </ol>
  );
}
