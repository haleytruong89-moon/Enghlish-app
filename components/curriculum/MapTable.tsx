import { curriculumCopy } from "@/lib/copy/vi";
import type { UnitDraft } from "@/lib/curriculum/schema";

/** Read-only "Bảng nối Unit → điểm" of an approved (or superseded) version: one row per unit, points as names. */
export function MapTable({ units, labelOf }: { units: UnitDraft[]; labelOf: Record<string, string> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid="curriculum-map-table">
        <thead className="text-xs text-muted">
          <tr>
            <th className="p-3">{curriculumCopy.col.code}</th>
            <th className="p-3">{curriculumCopy.col.title}</th>
            <th className="p-3">{curriculumCopy.col.section}</th>
            <th className="p-3">{curriculumCopy.col.page}</th>
            <th className="p-3">{curriculumCopy.col.points}</th>
          </tr>
        </thead>
        <tbody>
          {units.filter((u) => !u.dropped).map((u) => (
            <tr key={u.code} className="border-t border-line align-top" data-testid={`map-row-${u.code}`}>
              <td className="p-3 font-semibold">{u.code}</td>
              <td className="p-3">
                {u.title}
                {u.skipped ? <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
              </td>
              <td className="p-3 text-muted">{u.section ?? "—"}</td>
              <td className="p-3 text-muted">{u.page ?? "—"}</td>
              <td className="p-3">{u.points.length ? u.points.map((k) => labelOf[k] ?? k).join(" · ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
