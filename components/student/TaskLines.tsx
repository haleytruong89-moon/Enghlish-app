import { promptLines, rangeLabel } from "@/lib/studio/promptParts";

/** The task of a step, one line per part ("Questions 3–5 · …" for Studio tests), keeping the line breaks the tutor wrote. */
export function TaskLines({ prompt, className = "" }: { prompt: string; className?: string }) {
  const lines = promptLines(prompt);
  if (lines.length <= 1) {
    return (
      <p lang="en" className={`whitespace-pre-line ${className}`}>
        {prompt}
      </p>
    );
  }
  return (
    <ul lang="en" className={`flex flex-col gap-1.5 ${className}`} data-testid="task-lines">
      {lines.map((l, k) => (
        <li key={k}>
          {l.from !== null && l.to !== null ? <b>{rangeLabel(l.from, l.to)} · </b> : null}
          {l.text}
        </li>
      ))}
    </ul>
  );
}
