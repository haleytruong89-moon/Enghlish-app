import { levelCopy } from "@/lib/copy/vi";
import { strongestWeakest } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { boxValue, profileSummary } from "@/lib/levels/view";

/** "{tên} đang ở đâu?": one plain sentence (conclusion first), then Mạnh nhất / Cần tập trung / Đang chờ cô (D4). Staff only. */
export function LevelSummaryCard({ alias, profile }: { alias: string; profile: LevelProfile }) {
  const { strongest, weakest, even } = strongestWeakest(profile.domains);
  const boxes = [
    { key: "strongest", title: levelCopy.strongest, value: even ? levelCopy.even : boxValue(strongest) },
    { key: "focus", title: levelCopy.focus, value: even ? levelCopy.even : boxValue(weakest) },
    // Proposals to move up come with S7; until then nothing waits for the tutor.
    { key: "waiting", title: levelCopy.waiting, value: levelCopy.waitingNone },
  ];
  return (
    <section aria-labelledby="level-where" className="mt-6 rounded-2xl border border-line bg-white p-5" data-testid="level-summary">
      <h2 id="level-where" className="text-xl font-bold">
        {levelCopy.whereTitle(alias)}
      </h2>
      <p className="mt-2" data-testid="level-summary-text">
        {profileSummary(alias, profile)}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {boxes.map((b) => (
          <div key={b.key} className="flex flex-col gap-1 rounded-xl border border-line bg-paper px-4 py-3" data-testid={`level-${b.key}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{b.title}</span>
            <span className="font-semibold">{b.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
