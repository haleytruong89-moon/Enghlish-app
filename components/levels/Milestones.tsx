import Link from "next/link";
import { externalCopy, fallbackLabels, levelCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import type { LevelProfile } from "@/lib/levels/types";
import { dayLabel, levelText, monthLabel } from "@/lib/levels/view";
import type { DomainKey } from "@/lib/skillmap/types";

/**
 * "Mốc ngoài & lịch sử": external exam results (with their sheet), the monthly reading reports as milestones of Đọc (month only,
 * no source - D10), then every level decision with its kind, day, tutor and reason. Staff only.
 */
export function Milestones({ profile, learnerId }: { profile: LevelProfile; learnerId: string }) {
  const byKey = new Map(profile.domains.map((d) => [d.key, d]));
  const name = (k: DomainKey) => byKey.get(k)?.name ?? k;
  const lv = (k: DomainKey, level: string) => levelText(byKey.get(k)?.scale ?? "cefr", level);
  return (
    <section aria-labelledby="milestones-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="milestones">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="milestones-title" className="text-xl font-semibold">
          {levelCopy.milestonesTitle}
        </h2>
        <Link
          href={`/learners/${learnerId}/levels/external/new`}
          data-testid="add-external"
          className="inline-flex min-h-11 items-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent no-underline"
        >
          {levelCopy.addExternal}
        </Link>
      </div>

      <h3 className="mt-4 text-base font-semibold">{levelCopy.externalTitle}</h3>
      {profile.externalResults.length === 0 && profile.readingReports.length === 0 ? <p className="text-sm text-muted">{levelCopy.externalNone}</p> : null}
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {profile.externalResults.map((e) => (
          <li key={e.id} data-testid={`external-${e.id}`} className="flex flex-col gap-0.5 rounded-lg bg-paper px-4 py-2">
            <span className="font-semibold">{levelCopy.externalLine(externalCopy.examLabels[e.exam] ?? fallbackLabels.exam, formatDateVi(e.takenOn), e.scoreText)}</span>
            <span className="text-muted">{levelCopy.externalDomains(e.domains.map(name).join(", "))}</span>
            {e.note ? <span>“{e.note}”</span> : null}
            {e.fileId ? (
              <a href={`/api/files/${e.fileId}`} className="text-accent underline" data-testid={`external-file-${e.id}`}>
                {levelCopy.openFile}
              </a>
            ) : null}
            {e.replaces ? (
              // A2: a correction replaces an earlier entry; the old one stays in the book and is shown next to the new one.
              <span className="text-muted" data-testid={`external-corrected-${e.id}`}>
                {levelCopy.corrected(e.replaces.scoreText)}
                {e.replaces.fileId ? (
                  <>
                    {" · "}
                    <a href={`/api/files/${e.replaces.fileId}`} className="text-accent underline">
                      {levelCopy.openOldFile}
                    </a>
                  </>
                ) : null}
              </span>
            ) : null}
            <Link
              href={`/learners/${learnerId}/levels/external/new?edit=${e.id}`}
              data-testid={`external-edit-${e.id}`}
              className="inline-flex min-h-11 items-center self-start text-accent underline"
            >
              {levelCopy.editExternal}
            </Link>
          </li>
        ))}
        {profile.readingReports.map((r) => (
          <li key={r.month} data-testid={`reading-report-${r.month}`} className="rounded-lg bg-paper px-4 py-2">
            {levelCopy.readingReportLine(monthLabel(r.month))}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-base font-semibold">{levelCopy.historyTitle}</h3>
      {profile.history.length === 0 ? (
        <p className="text-sm text-muted">{levelCopy.historyNone}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {profile.history.map((h) => (
            <li key={h.id} data-testid={`history-${h.id}`} className="flex flex-col gap-0.5 border-l-4 border-line pl-3">
              <span className="font-semibold">{levelCopy.historyLine(name(h.domainKey), lv(h.domainKey, h.from), lv(h.domainKey, h.to))}</span>
              <span className="text-muted">{levelCopy.historyMeta(levelCopy.kindLabels[h.kind] ?? fallbackLabels.levelKind, dayLabel(h.decidedAt), h.decidedBy)}</span>
              {h.reason ? <span>“{h.reason}”</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
