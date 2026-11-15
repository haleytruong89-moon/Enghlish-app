"use client";

import { submitScreenCopy as copy } from "@/lib/copy/vi";
import type { Missing } from "@/lib/practice/twoQuestions";

/** "Còn thiếu: …" + "Nộp" (turned on only when nothing is missing). The button is the submit button of the form around it. */
export function MissingRow({ missing, unit, busy }: { missing: Missing[]; unit: "page" | "photo"; busy: "upload" | "send" | null }) {
  const parts = missing.map((m) => (m === "pages" && unit === "photo" ? copy.missingPart.photos : copy.missingPart[m]));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
      {parts.length > 0 ? (
        <span className="text-sm font-medium text-[#7a4a00]" data-testid="submit-missing">
          {copy.missing(parts)}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={parts.length > 0 || busy !== null}
        data-testid="submit-send"
        className="min-h-12 rounded-xl bg-accent px-8 text-base font-bold text-white disabled:opacity-50"
      >
        {busy === "upload" ? copy.uploading : busy === "send" ? copy.sending : copy.send}
      </button>
    </div>
  );
}
