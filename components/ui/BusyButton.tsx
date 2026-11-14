import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A button that says what it is doing while it works ("Đang lưu…"), is disabled meanwhile and tells screen readers (aria-busy).
 * Drop-in for `<button disabled={busy}>label</button>` on the adult screens.
 */
export function BusyButton({
  busy,
  busyLabel,
  disabled,
  children,
  ...rest
}: { busy: boolean; busyLabel: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button {...rest} disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy ? busyLabel : children}
    </button>
  );
}
