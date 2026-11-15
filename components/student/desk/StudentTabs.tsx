"use client";

import Link from "next/link";
import { useMemo } from "react";
import { studentDeskCopy } from "@/lib/copy/vi";
import { countNew } from "@/lib/student/seenMemo";
import { useLastOpened } from "./useLastOpened";

export type DeskTab = "today" | "seen" | "done" | "journey";

const TABS: { key: DeskTab; href: string; icon: string }[] = [
  { key: "today", href: "/", icon: "M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M10 21v-6h4v6" },
  { key: "seen", href: "/seen", icon: "M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" },
  { key: "done", href: "/done", icon: "M12 8v4l2 2M3.05 11a9 9 0 1 1 .5 4M3 20v-5h5" },
  { key: "journey", href: "/journey", icon: "M3 20h18l-7-12-3 5-2-3zM14 8V3l4 1.5L14 6" },
];

/**
 * The four tabs of the child's desk: a bar at the bottom on a phone / portrait iPad, a column on the left from `md`. The "Mới" number on
 * "Đã xem" counts what an adult saw after the child last opened that tab ON THIS DEVICE (localStorage; never sent anywhere).
 */
export function StudentTabs({ active, learnerId, seenTimes }: { active: DeskTab; learnerId: string; seenTimes: string[] }) {
  const last = useLastOpened(learnerId);
  const fresh = useMemo(() => (active === "seen" || last === undefined ? 0 : countNew(seenTimes, last)), [active, last, seenTimes]);
  return (
    <nav
      aria-label={studentDeskCopy.tabsLabel}
      data-testid="student-nav"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white px-1 pb-[env(safe-area-inset-bottom)] md:static md:z-auto md:w-52 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-t-0 md:px-3 md:py-5 md:pb-5"
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            data-testid={`tab-${t.key}`}
            aria-current={on ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[13px] no-underline md:min-h-12 md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:text-base ${on ? "bg-[#e3ece8] font-semibold text-accent" : "text-ink"}`}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d={t.icon} />
            </svg>
            <span>{studentDeskCopy.tabs[t.key]}</span>
            {t.key === "seen" && fresh > 0 ? (
              <span
                data-testid="seen-new-badge"
                aria-label={studentDeskCopy.newCountAria(fresh)}
                className="absolute right-2 top-1.5 rounded-full bg-[#b4531c] px-2 py-0.5 text-[11px] font-bold leading-none text-white md:static md:ml-auto"
              >
                <span data-count="work">{fresh}</span> {studentDeskCopy.newBadge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
