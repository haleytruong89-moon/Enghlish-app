import type { KeyboardEvent } from "react";

const SUBMIT_SAFE = new Set(["submit", "button", "checkbox", "radio", "file", "reset", "image"]);

/**
 * Stops the browser's "implicit submission": Enter in a one-line input must not send the whole form.
 * Textareas and buttons are untouched, so a line break and an explicit button press still work.
 */
export function blockImplicitSubmit(e: KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== "Enter") return;
  const t = e.target as HTMLElement | null;
  if (!t || t.tagName !== "INPUT") return;
  if (SUBMIT_SAFE.has((t as HTMLInputElement).type)) return;
  e.preventDefault();
}
