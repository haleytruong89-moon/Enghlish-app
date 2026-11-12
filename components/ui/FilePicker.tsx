"use client";

import { filePickerCopy } from "@/lib/copy/vi";

/**
 * One clear "📎 Chọn file" control for every adult file input. The native input stays in the DOM (visually hidden, inside
 * the label, so keyboard + screen readers + Playwright `setInputFiles` all keep working); the chosen name is shown beside it.
 */
export function FilePicker({
  testId,
  nameTestId,
  accept,
  name,
  onPick,
  ariaLabel,
  ariaDescribedBy,
  disabled = false,
}: {
  testId: string;
  nameTestId?: string;
  accept: string;
  /** Name of the file currently chosen (null = none). The caller owns the file itself. */
  name: string | null;
  onPick: (file: File | undefined) => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-3 font-normal">
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent focus-within:ring-2 focus-within:ring-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span aria-hidden="true">{filePickerCopy.icon}</span>
        {/* The visible text is part of the accessible name (WCAG 2.5.3): "<field>: Chọn file". */}
        <span className="sr-only">{ariaLabel}: </span>
        {name ? filePickerCopy.change : filePickerCopy.choose}
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          data-testid={testId}
          aria-describedby={ariaDescribedBy}
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <span role="status" aria-live="polite" className="break-all text-sm text-ink" data-testid={nameTestId ?? `${testId}-name`}>
        {name ?? <span className="text-muted">{filePickerCopy.none}</span>}
      </span>
    </span>
  );
}
