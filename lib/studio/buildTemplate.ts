/**
 * A validated draft → what english.eng_approve_studio_draft inserts (spec §4.4, plan D3–D4): one PRACTICE step of ACT-SOURCE-QA with
 * the in-app items (ids q<n>, MCQ options as "A. text", NO answer / explanation keys — the template triggers refuse them), the key rows
 * (MCQ: the letter; other closed kinds: key and accepted answers joined by " / "; open: a sealed model answer), the item meta (one tag
 * per item), the reading texts used by in-app items, and the paper frame {total, parts with ranges, items with their tag}. Pure.
 */
import { CLOSED_STUDIO_KINDS, type StudioDraft, type StudioItem, type StudioItemKind, type StudioPassage } from "./schema";

export type BuildItem = { id: string; kind: StudioItemKind; stem: string; options: string[]; target_id: string | null };
export type BuildKey = { item_id: string; kind: "answer" | "sealed"; answer: string | null; explanation_vi: string | null };
export type BuildMeta = { n: number; part: string; tag_key: string | null; reading_skill_key: string | null; out_of_app: boolean };
export type StudioBuild = {
  template: { prompt_en: string; time_min: number; target_ids: string[]; items: BuildItem[] };
  keys: BuildKey[];
  meta: BuildMeta[];
  passages: StudioPassage[];
  frame: { total: number; parts: { key: string; name: string; from: number; to: number }[]; items: { n: number; part: string; tag_key: string }[] };
};

/** Shown above the questions when no part has instructions (exercise content, English like every prompt_en). */
const DEFAULT_PROMPT_EN = "Answer the questions.";
export const itemIdOf = (n: number) => `q${n}`;
const isClosed = (i: StudioItem) => (CLOSED_STUDIO_KINDS as readonly string[]).includes(i.kind);

export function buildStudioBuild(d: StudioDraft): StudioBuild {
  const items = [...d.items].sort((a, b) => a.n - b.n);
  const app = items.filter((i) => !i.out_of_app);
  if (app.some((i) => isClosed(i) && !(i.key ?? "").trim()) || items.some((i) => (i.tag_key ?? i.reading_skill_key) === null)) {
    throw new Error("studio_build_blocked");
  }
  const usedRefs = new Set(app.map((i) => i.passage_ref).filter((r): r is string => r !== null));
  const appParts = d.parts.filter((p) => app.some((i) => i.part === p.key));
  const prompt = appParts.map((p) => (p.instructions.trim() ? `${p.name}: ${p.instructions.trim()}` : p.name)).join("\n").slice(0, 2000);
  const explanation = (i: StudioItem) => i.explanation_vi.trim() || null;

  return {
    template: {
      prompt_en: prompt || DEFAULT_PROMPT_EN,
      time_min: Math.min(120, Math.max(5, app.length)),
      target_ids: [...new Set(app.map((i) => i.target_id).filter((t): t is string => t !== null))],
      items: app.map((i) => ({
        id: itemIdOf(i.n),
        kind: i.kind,
        stem: i.stem.trim(),
        options: i.kind === "mcq" ? i.options.map((o) => `${o.letter}. ${o.text}`) : [],
        target_id: i.target_id,
      })),
    },
    keys: app.map((i) =>
      i.kind === "open"
        ? { item_id: itemIdOf(i.n), kind: "sealed" as const, answer: (i.key ?? "").trim() || null, explanation_vi: explanation(i) }
        : {
            item_id: itemIdOf(i.n),
            kind: "answer" as const,
            answer: i.kind === "mcq" ? (i.key ?? "").trim().toUpperCase() : [(i.key ?? "").trim(), ...i.accepted].join(" / "),
            explanation_vi: explanation(i),
          },
    ),
    meta: items.map((i) => ({ n: i.n, part: i.part, tag_key: i.tag_key, reading_skill_key: i.reading_skill_key, out_of_app: i.out_of_app })),
    passages: d.passages.filter((p) => usedRefs.has(p.ref)),
    frame: {
      total: items.length,
      parts: d.parts
        .filter((p) => items.some((i) => i.part === p.key))
        .map((p) => {
          const ns = items.filter((i) => i.part === p.key).map((i) => i.n);
          return { key: p.key, name: p.name, from: Math.min(...ns), to: Math.max(...ns) };
        }),
      items: items.map((i) => ({ n: i.n, part: i.part, tag_key: (i.tag_key ?? i.reading_skill_key) as string })),
    },
  };
}
