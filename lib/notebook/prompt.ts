/**
 * E2a · the model calls of "Tra từ": Sonnet writes the card (vocab-card.v1) or explains again (vocab-again.v1); Haiku checks
 * (vocab-check.v1) and picks a sense (vocab-sense.v1, a number only, never text for the child). Pure: builds calls from what the server
 * knows; never reads a key. Nothing about the child is sent but the word, their sentence, the level band and the explanation language.
 */
import type { ToolCall, ToolSpec } from "@/lib/ai/request";
import { WHY_MAX_LINES, type CardContent } from "./card";

export const CARD_PROMPT = { file: "vocab-card.v1", version: "vocab-card.v1" } as const;
export const CARD_CHECK_PROMPT = { file: "vocab-check.v1", version: "vocab-check.v1" } as const;
export const SENSE_PROMPT = { file: "vocab-sense.v1", version: "vocab-sense.v1" } as const;
export const AGAIN_PROMPT = { file: "vocab-again.v1", version: "vocab-again.v1" } as const;
/** Model 5.5 thinks before it answers: room for that plus a full card. */
export const CARD_MAX_TOKENS = 6000;
export const CHECK_MAX_TOKENS = 1500;
export const SENSE_MAX_TOKENS = 800;
export const AGAIN_MAX_TOKENS = 3000;

/** Per explanation language (track configuration `tutor_language`, never the track id). */
export const VOCAB_LANGUAGE_RULES: Record<string, { rule: string; length: string }> = {
  vi: {
    rule: "Vietnamese, short simple sentences for an 11–12 year old. The English word, examples and self-check sentences stay in English.",
    length: "Keep every field short: one or two lines each.",
  },
  en_first: {
    rule: "English first, at the child's level, for a 14–15 year old preparing for the grade-10 entrance exam. Keep `vi` lines, meaning_vi and `vn` in Vietnamese.",
    length: "Keep every field short: at most two or three lines each.",
  },
};
export const vocabLanguageRule = (lang: string) => VOCAB_LANGUAGE_RULES[lang] ?? VOCAB_LANGUAGE_RULES.vi!;

const str = (max: number) => ({ type: "string", maxLength: max });
const cardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headword", "forms", "pos", "lemma_note", "senses", "guess", "core", "examples", "why", "vn", "trap", "stress_tip", "family", "collocations", "related", "checks", "task"],
  properties: {
    headword: str(40),
    forms: { type: "array", items: str(40), minItems: 1, maxItems: 12 },
    pos: str(60),
    lemma_note: { type: ["string", "null"], maxLength: 120 },
    senses: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["meaning_vi", "meaning_en"], properties: { meaning_vi: str(120), meaning_en: { type: ["string", "null"], maxLength: 160 } } } },
    guess: {
      type: "object", additionalProperties: false, required: ["q", "options", "right", "yes", "no"],
      properties: { q: str(240), options: { type: "array", items: str(160), minItems: 2, maxItems: 2 }, right: { type: "integer", enum: [0, 1] }, yes: str(200), no: str(200) },
    },
    core: str(160),
    examples: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["en", "vi"], properties: { en: str(160), vi: str(160) } } },
    why: str(600),
    vn: str(300),
    trap: str(300),
    stress_tip: str(160),
    family: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["form", "pos"], properties: { form: str(40), pos: str(40) } } },
    collocations: { type: "array", items: str(60), minItems: 3, maxItems: 5 },
    related: { type: "array", items: str(40), minItems: 3, maxItems: 5 },
    checks: {
      type: "array", minItems: 1, maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["q", "options", "right", "note"], properties: { q: str(200), options: { type: "array", items: str(80), minItems: 2, maxItems: 4 }, right: { type: "integer", minimum: 0, maximum: 3 }, note: str(200) } },
    },
    task: str(200),
  },
};

export const cardTool: ToolSpec = {
  name: "save_vocab_card",
  description: "The word card shown to the child, or not_word with spelling suggestions.",
  input_schema: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["ok", "not_word"] },
      card: cardSchema,
      suggestions: { type: "array", items: str(40), maxItems: 3 },
    },
  },
};
export const CARD_CHECK_REASONS = ["wrong_meaning", "not_age_appropriate", "level_mismatch", "off_topic", "wrong_check_answer", "reveals_private"] as const;
export const cardCheckTool: ToolSpec = {
  name: "check_vocab_card",
  description: "Whether the card may be shown to the child.",
  input_schema: {
    type: "object",
    required: ["pass", "reasons"],
    properties: { pass: { type: "boolean" }, reasons: { type: "array", items: { type: "string", enum: [...CARD_CHECK_REASONS] } } },
  },
};
export const senseTool: ToolSpec = {
  name: "pick_sense",
  description: "Index of the meaning used in the child's sentence, or -1.",
  input_schema: { type: "object", required: ["index"], properties: { index: { type: "integer", minimum: -1, maximum: 2 } } },
};
export const againTool: ToolSpec = {
  name: "explain_again",
  description: "The same word explained from one new angle.",
  input_schema: {
    type: "object",
    required: ["angle", "core", "examples", "task"],
    properties: {
      angle: { type: "string", enum: ["picture", "everyday", "vietnamese"] },
      core: str(160),
      examples: { type: "array", minItems: 2, maxItems: 2, items: { type: "object", required: ["en", "vi"], properties: { en: str(160), vi: str(160) } } },
      task: str(200),
    },
  },
};

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => vars[k] ?? "");
/** The child's text goes between <<<CHILD … CHILD>>>: it can never close that block. */
export const asData = (s: string | null | undefined) => (s ?? "").replace(/[<>]{2,}/g, " ").replace(/\b(CHILD|WORD|CARD)\b/g, (m) => m.toLowerCase());

export function buildCardCall(o: {
  template: string; model: string; word: string; context: string | null; language: string; band: string; rewriteFor?: string[];
  keepSenses?: CardContent["senses"]; toolChoice?: "tool" | "auto";
}): ToolCall {
  const lang = vocabLanguageRule(o.language);
  const keep = o.keepSenses?.length
    ? `\nTHE CARD ALREADY HAS THESE MEANINGS (keep them after the new first meaning, at most 3 in total; drop the least common if needed):\n${o.keepSenses.map((s, i) => `${i}. ${s.meaning_vi}${s.meaning_en ? ` / ${s.meaning_en}` : ""}`).join("\n")}\n`
    : "";
  const rewrite = o.rewriteFor?.length
    ? `\nYOUR PREVIOUS CARD WAS REFUSED (${o.rewriteFor.join(", ")}). Write a new card that fixes every reason and keeps all the rules.`
    : "";
  return {
    model: o.model,
    documents: [],
    instructions: fill(o.template, {
      BAND: o.band || "(unknown)",
      LANGUAGE_RULE: lang.rule,
      LENGTH_RULE: lang.length,
      WHY_LINES: String(WHY_MAX_LINES[o.language] ?? WHY_MAX_LINES.vi),
      WORD: o.word,
      CONTEXT: asData(o.context),
      KEEP_SENSES: keep,
      REWRITE: rewrite,
    }),
    tool: cardTool,
    maxTokens: CARD_MAX_TOKENS,
    toolChoice: o.toolChoice ?? "auto",
  };
}

export function buildCardCheckCall(o: { template: string; model: string; word: string; card: unknown; language: string; band: string; context?: string | null; toolChoice?: "tool" | "auto" }): ToolCall {
  return {
    model: o.model,
    documents: [],
    instructions: fill(o.template, { BAND: o.band || "(unknown)", LANGUAGE: o.language, WORD: o.word, CONTEXT: asData(o.context), CARD: JSON.stringify(o.card) }),
    tool: cardCheckTool,
    maxTokens: CHECK_MAX_TOKENS,
    toolChoice: o.toolChoice ?? "auto",
  };
}

export function buildSenseCall(o: { template: string; model: string; word: string; senses: CardContent["senses"]; context: string; toolChoice?: "tool" | "auto" }): ToolCall {
  return {
    model: o.model,
    documents: [],
    instructions: fill(o.template, {
      WORD: o.word,
      SENSES: o.senses.map((s, i) => `${i}. ${s.meaning_vi}${s.meaning_en ? ` / ${s.meaning_en}` : ""}`).join("\n"),
      CONTEXT: asData(o.context),
    }),
    tool: senseTool,
    maxTokens: SENSE_MAX_TOKENS,
    toolChoice: o.toolChoice ?? "auto",
  };
}

export function buildAgainCall(o: { template: string; model: string; card: CardContent; language: string; band: string; rewriteFor?: string[]; toolChoice?: "tool" | "auto" }): ToolCall {
  const lang = vocabLanguageRule(o.language);
  return {
    model: o.model,
    documents: [],
    instructions: fill(o.template, {
      BAND: o.band || "(unknown)",
      LANGUAGE_RULE: lang.rule,
      LENGTH_RULE: lang.length,
      CARD: JSON.stringify({ headword: o.card.headword, senses: o.card.senses, core: o.card.core, examples: o.card.examples, why: o.card.why }),
      REWRITE: o.rewriteFor?.length ? `\nYOUR PREVIOUS ANSWER WAS REFUSED (${o.rewriteFor.join(", ")}). Fix every reason.` : "",
    }),
    tool: againTool,
    maxTokens: AGAIN_MAX_TOKENS,
    toolChoice: o.toolChoice ?? "auto",
  };
}
