/**
 * AI tool output → strict draft payload (spec §5 "code kiểm"; DOMAIN §9.2 "Đọc mục lục"): stable unit codes from the printed numbers,
 * the AI's order kept, numbering that is not 1, 2, 3… flagged, duplicate codes made unique and flagged, points outside the closed list
 * dropped and flagged ("cần xem"). Never invents a point. Pure.
 */
import type { TocContext } from "./context";
import type { AiToc, CurriculumPayload, IgnoredRow, UnitDraft } from "./schema";
import { CURRICULUM_LIMITS as L, IGNORED_REASONS, type IgnoredReason, type UnitFlag } from "./types";

const clean = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t.length > 0 ? t : null;
};

/** "7" → "U7"; "Starter" → "X-STARTER"; nothing usable → null. Same shape as curriculum_units.code. */
export function unitCodeOf(printed: string): string | null {
  const t = printed.trim();
  if (/^\d{1,3}$/.test(t)) return `U${Number(t)}`;
  const slug = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/^UNIT\s*/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (/^\d{1,3}$/.test(slug)) return `U${Number(slug)}`;
  return slug ? `X-${slug}`.slice(0, 20).replace(/-+$/, "") : null;
}

const numberOf = (code: string): number | null => (/^U\d+$/.test(code) ? Number(code.slice(1)) : null);

export function normalizeToc(ai: AiToc, ctx: TocContext): CurriculumPayload {
  const known = new Set(ctx.tags.map((t) => t.key));
  const used = new Map<string, number>();
  let lastNumber: number | null = null;
  const units: UnitDraft[] = ai.units.map((u, i) => {
    const flags: UnitFlag[] = [];
    if (u.needs_review) flags.push("ai");
    let code = unitCodeOf(u.number);
    if (code === null) {
      code = `X-${i + 1}`;
      flags.push("bad_number");
    }
    const seen = used.get(code) ?? 0;
    used.set(code, seen + 1);
    if (seen > 0) {
      code = `${code}-${seen + 1}`.slice(0, 20);
      flags.push("duplicate_code");
    }
    const n = numberOf(code);
    if (n !== null) {
      if (n !== (lastNumber === null ? 1 : lastNumber + 1)) flags.push("numbering_gap");
      lastNumber = n;
    }
    const points: string[] = [];
    const unknown: string[] = [];
    for (const k of u.points) {
      const key = k.trim();
      if (!key || points.includes(key) || unknown.includes(key)) continue;
      if (known.has(key)) points.push(key);
      else unknown.push(key);
    }
    if (unknown.length > 0) flags.push("unknown_point");
    const title = clean(u.title, L.unitTitle);
    if (title === null) flags.push("no_title");
    const missing = [...u.missing_points, ...unknown].map((m) => clean(m, L.missingText)).filter((m): m is string => m !== null);
    return {
      code,
      title: title ?? code,
      section: clean(u.section, L.section),
      page: typeof u.page === "number" && u.page >= 1 && u.page <= L.page ? u.page : null,
      skipped: false,
      points: points.slice(0, L.points),
      missing_points: [...new Set(missing)].slice(0, L.missing),
      needs_review: flags.length > 0,
      review_reason: clean(u.review_reason, L.reason),
      flags,
      origin: "ai",
      ai_index: i,
      dropped: false,
      edit_reason: null,
    };
  });
  const ignored: IgnoredRow[] = ai.ignored
    .map((r) => ({
      label: clean(r.label, L.ignoredLabel),
      page: typeof r.page === "number" && r.page >= 1 && r.page <= L.page ? r.page : null,
      reason: ((IGNORED_REASONS as readonly string[]).includes(r.reason) ? r.reason : "other") as IgnoredReason,
    }))
    .filter((r): r is IgnoredRow => r.label !== null)
    .slice(0, L.ignored);
  return { units, ignored };
}
