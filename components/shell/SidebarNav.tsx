"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GradeButton } from "./GradeButton";
import { NavIcon } from "./NavIcon";
import { appFeedback, shellCopy } from "@/lib/copy/vi";
import type { NavLink, NavModel } from "@/lib/shell/nav";
import { activeFor, feedbackHref } from "@/lib/shell/paths";

const item = "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 no-underline";
/** Hướng B v2 (26/11): the daily actions stand out — Giao bài filled (main), Ghi buổi học thick outline (often); Chấm bài is red (GradeButton). */
/** A section row: icon + label; the open one has a bar on its left, a tint and bold text. */
const SECTION = "flex min-h-11 items-center gap-2.5 text-[15px] no-underline";
const QUICK_MAIN = "flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl bg-accent px-3.5 text-[15px] font-bold text-white no-underline shadow-[0_2px_0_#1f4439] hover:bg-[#1f4439]";
const QUICK_OFTEN = "flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl border-2 border-accent bg-white px-3 text-[15px] font-bold text-accent no-underline hover:bg-[#eef5f1]";

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
      <Link href={c.href} onClick={close} data-testid={testid} data-level="child" aria-current={current ? "page" : undefined}
        className={`${item} text-[13px] ${current ? "font-semibold text-accent" : "text-muted hover:bg-[#eceee8]"}`}>
        {c.label}
      </Link>
    </li>
  );
  return (
    <div className="border-b border-line bg-[#fbfbf8] md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r">
      {nav.quick.length > 0 && learnerId ? (
        <div role="group" aria-label={shellCopy.quick.label} data-testid="nav-quick" className="flex gap-2 overflow-x-auto px-3 pt-3 md:flex-col md:overflow-visible md:pb-1">
          {nav.quick.map((q) =>
            q.key === "grade" ? (
              <GradeButton key={q.key} learnerId={learnerId} href={q.href} label={q.label} onClick={close} />
            ) : (
              <Link key={q.key} href={q.href} onClick={close} data-testid={`quick-${q.key}`} data-tone={q.key === "assign" ? "main" : "often"}
                className={q.key === "assign" ? QUICK_MAIN : QUICK_OFTEN}>
                <NavIcon name={q.key} />
                {q.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="staff-nav" data-testid="nav-menu-toggle"
        className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold md:hidden">
        {shellCopy.menu} · {openLabel}
      </button>
      <nav id="staff-nav" aria-label={shellCopy.navLabel} data-testid="staff-sidebar"
        className={`${open ? "flex" : "hidden"} flex-col gap-1 px-3 pb-4 md:flex md:min-h-0 md:flex-1 md:overflow-y-auto md:py-3`}>
        <ul className="flex flex-col gap-1">
          {nav.sections.map((s) => {
            const current = active.section === s.key;
            return (
              <li key={s.key}>
                {s.href ? (
                  <Link href={s.href} onClick={close} data-testid={`nav-${s.key}`} data-level="section" aria-current={current ? "page" : undefined}
                    className={`${SECTION} ${current ? "rounded-r-lg border-l-4 border-accent bg-[#e3ece8] pl-2 pr-3 font-bold text-[#1d4136]" : "rounded-lg px-3 font-medium text-[#3f4641] hover:bg-[#eceee8]"}`}>
                    <NavIcon name={s.key} className={current ? "" : "text-muted"} />
                    {s.label}
                  </Link>
                ) : (
                  <span data-testid={`nav-${s.key}`} aria-disabled="true" data-status={s.status} data-level="section" className={`${SECTION} cursor-default rounded-lg px-3 font-medium text-muted`}>
                    <NavIcon name={s.key} />
                    {s.label}
                    {s.status === "soon" ? <span className="rounded-full bg-[#eceee8] px-2 py-0.5 text-xs font-semibold">{shellCopy.soon}</span> : null}
                  </span>
                )}
                {current && s.children.length > 0 ? (
                  <ul data-level="children" className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-line pl-3">{s.children.map((c) => child(c, `nav-${s.key}-${c.key}`, active.child === c.key))}</ul>
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
