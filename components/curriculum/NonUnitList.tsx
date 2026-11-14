"use client";

import Link from "next/link";
import { curriculumCopy, nonUnitCopy } from "@/lib/copy/vi";
import { isProgressTest } from "@/lib/curriculum/rows";
import type { IgnoredRow } from "@/lib/curriculum/schema";
import { formatRange } from "@/lib/prefill";

/**
 * "Không phải Unit (không tính)": Review, Progress Test and reference rows of the contents page. In a DRAFT each row can go back to the Units
 * table; in an APPROVED version (read-only) a row offers "Tạo bài từ đề" / "Giao bài luyện" with the name and the Units it revises filled in.
 * Open at once when there is a Progress Test, closed otherwise.
 */
export function NonUnitList({
  rows,
  mode,
  onToUnit,
  related,
  links,
}: {
  rows: IgnoredRow[];
  mode: "draft" | "approved";
  onToUnit?: (index: number) => void;
  /** Codes of the Units the row revises (draft and approved). */
  related?: string[][];
  /** Prepared links to the "Giao bài" chooser, prefilled (a server page cannot hand functions to this client component). */
  links?: string[];
}) {
  if (rows.length === 0) return null;
  const hasTest = rows.some(isProgressTest);
  return (
    <details open={hasTest} className="mt-4 rounded-xl border border-line bg-white p-3" data-testid="review-ignored">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
        {curriculumCopy.ignoredTitle} ({rows.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {rows.map((r, i) => {
          const units = related?.[i] ?? [];
          const link = mode === "approved" ? links?.[i] : undefined;
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`ignored-row-${i}`}>
              <span className="text-muted">{nonUnitCopy.line(curriculumCopy.ignoredReasons[r.reason], r.label, r.page)}</span>
              {isProgressTest(r) ? (
                <span className="rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs font-semibold text-[#6B4600]" data-testid={`ignored-test-${i}`}>
                  {nonUnitCopy.progressBadge}
                </span>
              ) : null}
              {units.length > 0 && (r.reason === "review" || r.reason === "test" || isProgressTest(r)) ? <span className="text-xs text-muted">{nonUnitCopy.related(formatRange(units))}</span> : null}
              {mode === "draft" && onToUnit ? (
                <button type="button" onClick={() => onToUnit(i)} data-testid={`ignored-to-unit-${i}`} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:border-accent">
                  {nonUnitCopy.toUnit}
                </button>
              ) : null}
              {link ? (
                <Link href={link} data-testid={`ignored-give-${i}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">
                  {nonUnitCopy.giveLink}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
