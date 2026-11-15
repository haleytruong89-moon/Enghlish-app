import { playerCopy as c } from "@/lib/copy/vi";

/** The dimmed "Hỏi gia sư · Sắp có" slot. Practice only; it does nothing yet (disabled, aria-disabled), and says why. */
export function AskTutorSlot() {
  return (
    <div className="flex flex-col gap-1" data-testid="ask-tutor">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby="ask-tutor-note"
        className="flex min-h-11 items-center gap-2 self-start rounded-xl border border-line bg-[#F1F3EF] px-4 text-sm font-semibold text-muted opacity-70"
      >
        {c.askTutor} · {c.askTutorSoon}
      </button>
      <span id="ask-tutor-note" className="text-xs text-muted">
        {c.askTutorNote}
      </span>
    </div>
  );
}
