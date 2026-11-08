/**
 * The tutor's reviewed rows → the `p_build` of english.eng_confirm_import (0027). Pure. Only questions that can be answered in the app become
 * template items (kind short, no target: imported work gives no S7a target evidence, R2); a paper-only row (out_of_app) stays in the meta.
 * Each row carries exactly one tag: a reading skill goes to reading_skill_key, anything else to tag_key.
 */
import type { ReadContext } from "./context";
import type { ConfirmRow } from "./schema";

export type BuildError = "unknown_tag" | "duplicate_row" | "no_app_rows";
export type ImportBuild = {
  template: { prompt_en: string; time_min: number; items: { id: string; kind: "short"; stem: string; options: string[]; target_id: null }[] };
  keys: { item_id: string; kind: "answer"; answer: string | null; explanation_vi: null }[];
  meta: { n: number; part: string; tag_key: string | null; reading_skill_key: string | null; out_of_app: boolean }[];
  results: { item_id: string; result: "correct" | "incorrect" | "blank" }[];
};

/** The answer kept as the key: the first of several accepted answers ("provided | providing" → "provided"). */
export const firstAccepted = (key: string | null): string | null => {
  const f = (key ?? "").split("|")[0]?.trim() ?? "";
  return f === "" ? null : f;
};

export function buildImport(rows: readonly ConfirmRow[], ctx: ReadContext): { ok: true; build: ImportBuild } | { ok: false; error: BuildError } {
  const byKey = new Map(ctx.tags.map((t) => [t.key, t]));
  if (new Set(rows.map((r) => r.n)).size !== rows.length) return { ok: false, error: "duplicate_row" };
  const sorted = [...rows].sort((a, b) => a.n - b.n);
  const app = sorted.filter((r) => !r.out_of_app);
  if (app.length === 0) return { ok: false, error: "no_app_rows" };
  const meta: ImportBuild["meta"] = [];
  for (const r of sorted) {
    const t = byKey.get(r.tag);
    if (!t) return { ok: false, error: "unknown_tag" };
    meta.push({ n: r.n, part: r.part.trim() || "-", tag_key: t.reading ? null : t.key, reading_skill_key: t.reading ? t.key : null, out_of_app: r.out_of_app });
  }
  return {
    ok: true,
    build: {
      template: { prompt_en: "Imported work.", time_min: 5, items: app.map((r) => ({ id: `q${r.n}`, kind: "short" as const, stem: `Question ${r.n}`, options: [], target_id: null })) },
      keys: app.map((r) => ({ item_id: `q${r.n}`, kind: "answer" as const, answer: firstAccepted(r.key_answer), explanation_vi: null })),
      meta,
      results: app.map((r) => ({ item_id: `q${r.n}`, result: r.result })),
    },
  };
}
