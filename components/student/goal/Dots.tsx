/** One dot per piece of the week's goal; filled = sent. Decoration only: the words next to it say the same (never colour alone). */
export function Dots({ done, goal }: { done: number; goal: number }) {
  const total = Math.max(goal, done);
  return (
    <div className="my-2 flex flex-wrap gap-1.5" aria-hidden="true" data-testid="week-dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-5 w-5 rounded-full border-2 ${i < done ? "border-accent bg-accent" : "border-[#b9bfb4] bg-transparent"}`} />
      ))}
    </div>
  );
}
