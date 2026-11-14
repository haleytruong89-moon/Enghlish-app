"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { appFeedback, shellCopy } from "@/lib/copy/vi";
import type { NavLink, NavModel } from "@/lib/shell/nav";
import { activeFor, feedbackHref } from "@/lib/shell/paths";

const item = "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm no-underline";

/**
 * The left column (spec §5 rule 5): sticky on a computer, a drawer under one button on a phone. One <nav> only (no duplicate test ids).
 * Children of the open section are shown under it (plan K5). "Góp ý về app" is always at the bottom.
 */
export function SidebarNav({ nav, learnerId }: { nav: NavModel; learnerId: string | null }) {
  const pathname = usePathname() ?? "/";
  const active = activeFor(pathname);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const openLabel = nav.sections.find((s) => s.key === active.section)?.label ?? nav.parent.find((p) => p.key === active.section)?.label ?? shellCopy.sections.desk;
  const child = (c: NavLink, testid: string, current: boolean) => (
    <li key={c.key}>
      <Link href={c.href} onClick={close} data-testid={testid} aria-current={current ? "page" : undefined}
        className={`${item} pl-6 ${current ? "font-semibold text-accent" : "text-ink hover:bg-[#eceee8]"}`}>
        {c.label}
      </Link>
    </li>
  );
  return (
    <div className="border-b border-line bg-[#fbfbf8] md:border-b-0 md:border-r">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="staff-nav" data-testid="nav-menu-toggle"
        className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold md:hidden">
        {shellCopy.menu} · {openLabel}
      </button>
      <nav id="staff-nav" aria-label={shellCopy.navLabel} data-testid="staff-sidebar"
        className={`${open ? "flex" : "hidden"} flex-col gap-1 px-3 pb-4 md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto md:py-4`}>
        <ul className="flex flex-col gap-1">
          {nav.sections.map((s) => {
            const current = active.section === s.key;
            return (
              <li key={s.key}>
                {s.href ? (
                  <Link href={s.href} onClick={close} data-testid={`nav-${s.key}`} aria-current={current ? "page" : undefined}
                    className={`${item} ${current ? "bg-[#e3ece8] font-semibold text-[#1d4136]" : "text-ink hover:bg-[#eceee8]"}`}>
                    {s.label}
                  </Link>
                ) : (
                  <span data-testid={`nav-${s.key}`} aria-disabled="true" data-status={s.status} className={`${item} cursor-default text-muted`}>
                    {s.label}
                    {s.status === "soon" ? <span className="rounded-full bg-[#eceee8] px-2 py-0.5 text-xs font-semibold">{shellCopy.soon}</span> : null}
                  </span>
                )}
                {current && s.children.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">{s.children.map((c) => child(c, `nav-${s.key}-${c.key}`, active.child === c.key))}</ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        {nav.parent.length > 0 ? (
          <>
            <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{shellCopy.parentGroup}</p>
            <ul className="flex flex-col gap-0.5">{nav.parent.map((p) => child(p, `nav-${p.key}`, active.section === p.key))}</ul>
          </>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 px-3 pt-4 text-xs text-muted">
          <p>{shellCopy.aiDraftNote}</p>
          <Link href={feedbackHref(pathname, learnerId)} onClick={close} data-testid="feedback-link"
            className="inline-flex min-h-11 items-center self-start rounded-lg border border-line bg-white px-3 text-sm font-medium text-accent no-underline hover:border-accent">
            {appFeedback.link}
          </Link>
        </div>
      </nav>
    </div>
  );
}
