import Link from "next/link";
import { todayPage } from "@/lib/copy/vi";
import type { AlertTone, DeskAlert } from "@/lib/desk/alerts";

const TONE: Record<AlertTone, { badge: string; row: string }> = {
  warn: { badge: "bg-[#7a4a00] text-white", row: "bg-[#fbf0dc]" },
  repeat: { badge: "bg-[#7a4a00] text-white", row: "bg-[#fbf0dc]" },
  sent: { badge: "bg-accent text-white", row: "bg-[#e5efe9]" },
  tag: { badge: "bg-[#2f5d9e] text-white", row: "bg-paper" },
  recheck: { badge: "bg-accent text-white", row: "bg-paper" },
  info: { badge: "bg-[#2f5d9e] text-white", row: "bg-[#eef3fa]" },
};

export function DeskAlerts({ learnerId, items }: { learnerId: string; items: DeskAlert[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label={todayPage.attentionTitle} data-testid={`attention-${learnerId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{todayPage.attentionTitle}</h2>
        <Link href={`/learners/${learnerId}/weak`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">{todayPage.seeAll}</Link>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted">{todayPage.attentionEmpty}</p> : null}
      {items.map((r) => (
        <Link key={r.key} href={r.href} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-ink no-underline ${TONE[r.tone].row}`}>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[r.tone].badge}`}>{r.badge}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{r.title}</span>
            <span className="text-sm text-muted">{r.line}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
