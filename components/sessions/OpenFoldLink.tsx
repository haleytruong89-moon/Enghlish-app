"use client";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Bản 3: "Ghi buổi nghỉ" opens the folded absence form. The URL (`?nghi=1#ghi-nghi`) opens it on load; the click also opens it when the
 * adult had closed it on this same URL (same URL = no re-render, the browser only scrolls).
 */
export function OpenFoldLink({ href, foldId, className, testId, children }: { href: string; foldId: string; className: string; testId: string; children: ReactNode }) {
  return (
    <Link href={href} data-testid={testId} className={className}
      onClick={() => { const d = document.getElementById(foldId); if (d instanceof HTMLDetailsElement) d.open = true; }}>
      {children}
    </Link>
  );
}
