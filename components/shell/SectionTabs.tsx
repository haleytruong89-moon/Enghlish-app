import Link from "next/link";
import type { TabLink } from "@/lib/shell/tabs";

/** One row of tabs that are links to sibling pages (works without JS; the URL says which tab is open). */
export function SectionTabs({ label, tabs, current }: { label: string; tabs: TabLink[]; current: string }) {
  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap gap-2 print:hidden" data-testid="section-tabs">
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined} data-testid={`section-tab-${t.key}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold no-underline ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
