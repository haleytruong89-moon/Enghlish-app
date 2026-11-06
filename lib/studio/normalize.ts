/**
 * AI tool output → a strict draft (spec §5.3–§5.4). The model may use the spike's kind names, put a reading tag in tag_key, propose a
 * tag or skill outside the lists, add options to a non-MCQ item or write a score-like explanation: each is repaired and the item is
 * marked "cần xem" with the reason. Blocking issues of validateDraft are marked too. Pure.
 */
import { studioReviewReasons, studioIssueText } from "@/lib/copy/vi";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { tagOf, type StudioContext } from "./context";
import { STUDIO_LIMITS, type AiExtract, type StudioDraft, type StudioItem, type StudioItemKind, type StudioPart, type StudioPassage } from "./schema";
import { validateDraft, type Issue } from "./validate";

const KIND_ALIASES: Record<string, StudioItemKind> = {
  mcq: "mcq", gap: "gap", word_form: "word_form", wordform: "word_form", transform: "transform", short: "short", open: "open", other: "open",
};
const PART_KEY = /^[A-Za-z0-9-]{1,20}$/;
const REF = /^[A-Za-z0-9]{1,10}$/;

/** Same rule as english.eng_norm_answer (0009): clean, drop end punctuation, lower case. */
export function normAnswer(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[   -  　]/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+\s*$/, "")
    .trim()
    .toLowerCase();
}

const clip = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);

export function normalizeExtract(raw: AiExtract, ctx: StudioContext): StudioDraft {
  const parts: StudioPart[] = [];
  for (const [k, p] of raw.parts.entries()) {
    const key = PART_KEY.test(p.key.trim()) ? p.key.trim() : String.fromCharCode(65 + (k % 26));
    if (parts.some((x) => x.key === key)) continue;
    parts.push({ key, name: clip(p.name, STUDIO_LIMITS.partName) || key, instructions: clip(p.instructions, STUDIO_LIMITS.instructions) });
  }
  const passages: StudioPassage[] = [];
  for (const [k, p] of raw.passages.entries()) {
    const text = clip(p.text, STUDIO_LIMITS.passageText);
    if (!text) continue;
    const ref = REF.test(p.ref.trim()) && !passages.some((x) => x.ref === p.ref.trim()) ? p.ref.trim() : `P${k + 1}`;
    passages.push({ ref, title: clip(p.title, STUDIO_LIMITS.passageTitle) || ref, text });
  }
  if (parts.length === 0) parts.push({ key: "A", name: "A", instructions: "" });
  const refs = new Set(passages.map((p) => p.ref));
  const skills = new Set(ctx.skills.map((s) => s.id));

  const seen = new Set<number>();
  const items: StudioItem[] = [];
  for (const r of [...raw.items].sort((a, b) => a.n - b.n)) {
    if (r.n < 1 || r.n > STUDIO_LIMITS.items || seen.has(r.n)) continue;
    seen.add(r.n);
    const reasons: string[] = [];
    let kind = KIND_ALIASES[r.kind.trim().toLowerCase()];
    if (!kind) {
      kind = "open";
      reasons.push(studioReviewReasons.kind);
    }
    let options = kind === "mcq"
      ? r.options
          .map((o) => ({ letter: o.letter.trim().toUpperCase(), text: clip(o.text, STUDIO_LIMITS.option) }))
          .filter((o) => /^[A-H]$/.test(o.letter) && o.text)
          .slice(0, STUDIO_LIMITS.options)
      : [];
    if (kind !== "mcq" && r.options.length > 0) reasons.push(studioReviewReasons.options);
    const rawKey = clip(r.key, STUDIO_LIMITS.key);
    const key = rawKey ? (kind === "mcq" && /^[a-h]$/i.test(rawKey) ? rawKey.toUpperCase() : rawKey) : null;
    const accepted = kind === "mcq"
      ? []
      : [...new Set(r.accepted.map((a) => clip(a, STUDIO_LIMITS.key)).filter((a) => a && (key === null || normAnswer(a) !== normAnswer(key))))].slice(0, STUDIO_LIMITS.accepted);

    let tagKey = r.tag_key ?? null;
    let readingKey = r.reading_skill_key ?? null;
    if (tagKey !== null && tagOf(ctx, tagKey)?.reading && readingKey === null) {
      readingKey = tagKey;
      tagKey = null;
    }
    if (tagKey !== null && readingKey !== null) {
      if (r.passage_ref) tagKey = null;
      else readingKey = null;
    }
    if (tagKey !== null && (!tagOf(ctx, tagKey) || tagOf(ctx, tagKey)?.reading)) {
      tagKey = null;
      reasons.push(studioReviewReasons.tag);
    }
    if (readingKey !== null && !tagOf(ctx, readingKey)?.reading) {
      readingKey = null;
      reasons.push(studioReviewReasons.tag);
    }
    let target = r.target_id ?? null;
    if (target !== null && !skills.has(target)) {
      target = null;
      reasons.push(studioReviewReasons.skill);
    }
    if (target === null && readingKey !== null) target = tagOf(ctx, readingKey)?.related.find((t) => skills.has(t)) ?? null;
    let passageRef = r.passage_ref ? r.passage_ref.trim() : null;
    if (passageRef !== null && !refs.has(passageRef)) {
      passageRef = null;
      reasons.push(studioReviewReasons.passage);
    }
    let explanation = clip(r.explanation_vi, STUDIO_LIMITS.explanation);
    if (hasScoreWords(explanation)) {
      explanation = "";
      reasons.push(studioReviewReasons.explanation);
    }
    const part = parts.some((p) => p.key === r.part.trim()) ? r.part.trim() : (parts[0] as StudioPart).key;
    if (kind !== "mcq") options = [];
    items.push({
      n: r.n,
      part,
      kind,
      out_of_app: r.out_of_app ?? false,
      stem: clip(r.stem, STUDIO_LIMITS.stem),
      options,
      passage_ref: passageRef,
      key,
      accepted,
      tag_key: tagKey,
      target_id: target,
      reading_skill_key: readingKey,
      explanation_vi: explanation,
      needs_review: Boolean(r.needs_review) || reasons.length > 0,
      review_reason: (clip(r.review_reason, STUDIO_LIMITS.reason) || reasons.join(" ").slice(0, STUDIO_LIMITS.reason)) || null,
    });
  }
  const draft: StudioDraft = { parts, passages, items };
  return markIssues(draft, validateDraft(draft, ctx));
}

/** Items with a blocking issue are marked "cần xem" (spec §5.4: vi phạm → needs_review + lý do). */
export function markIssues(d: StudioDraft, issues: Issue[]): StudioDraft {
  return {
    ...d,
    items: d.items.map((i) => {
      const own = issues.filter((x) => x.blocking && x.n === i.n);
      if (own.length === 0) return i;
      return { ...i, needs_review: true, review_reason: i.review_reason ?? studioIssueText[own[0]!.code] };
    }),
  };
}
