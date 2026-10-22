import Link from "next/link";
import { weakPage } from "@/lib/copy/vi";
import type { WeakTile } from "@/lib/skillmap/group";
import type { WeakWindow } from "@/lib/tutorwork/schemas";

/** First layer of "Điểm cần chú ý" (SM-1): one tile per domain — how many points need attention and the worst one. Staff only. */
export function DomainTiles({ tiles, learnerId, weeks, active }: { tiles: WeakTile[]; learnerId: string; weeks: WeakWindow; active: string | null }) {
  const href = (d: string) => `/learners/${learnerId}/weak?weeks=${weeks}&domain=${d}`;
  const box = (on: boolean) =>
    `flex min-h-11 h-full flex-col gap-1 rounded-xl border px-4 py-3 ${on ? "border-accent bg-[#E3ECE8]" : "border-line bg-white hover:border-accent"}`;
  return (
    <nav aria-label={weakPage.tilesTitle} className="mt-5" data-testid="weak-tiles">
      <h2 className="text-lg font-semibold">{weakPage.tilesTitle}</h2>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key}>
            <Link href={href(t.key)} aria-current={t.key === active ? "page" : undefined} data-testid={`weak-tile-${t.key}`} className={box(t.key === active)}>
              <span className="font-semibold">{t.name}</span>
              <span className="text-sm" data-testid={`weak-tile-count-${t.key}`}>
                {weakPage.tileCount(t.weakCount)}
              </span>
              {t.worst ? <span className="text-sm text-muted">{weakPage.tileWorst(t.worst.label)}</span> : null}
            </Link>
          </li>
        ))}
        <li>
          <Link href={href("all")} aria-current={active === "all" ? "page" : undefined} data-testid="weak-tile-all" className={box(active === "all")}>
            <span className="font-semibold">{weakPage.tileAll}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
