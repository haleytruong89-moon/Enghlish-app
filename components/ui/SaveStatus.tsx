import { statusLine, type SaveState } from "@/lib/ui/saveStatus";

const TONE = { muted: "text-muted", ok: "text-accent", warn: "text-[#6B4600]", error: "text-red-700" } as const;

/** The save-status line. Text + symbol (● ✓), never colour alone. Renders an empty live region when there is nothing to say. */
export function SaveStatus({ state, className = "" }: { state: SaveState; className?: string }) {
  const line = statusLine(state);
  return (
    <p role="status" aria-live="polite" data-testid="save-status" className={`text-sm ${line ? TONE[line.tone] : ""} ${className}`}>
      {line?.text ?? ""}
    </p>
  );
}
