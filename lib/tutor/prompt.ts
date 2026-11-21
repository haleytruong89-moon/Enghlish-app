/**
 * E1 · the two model calls of one turn: Sonnet writes the hint (tutor-hint.v2), Haiku checks it (tutor-check.v2). Pure: builds the calls
 * from the server's context; nothing here reads a key or the network. The answers go into the prompts ONLY so the model avoids them and
 * the checker can judge; they never reach the child (the code check + Haiku + safe sentence stand between).
 */
import { leadOf } from "@/lib/studio/taskParts";
import type { ToolCall, ToolSpec } from "@/lib/ai/request";

export const HINT_PROMPT = { file: "tutor-hint.v2", version: "tutor-hint.v2" } as const;
export const CHECK_PROMPT = { file: "tutor-check.v2", version: "tutor-check.v2" } as const;
export const DEFAULT_TUTOR_MODEL = "claude-sonnet-5-5";
export const DEFAULT_CHECK_MODEL = "claude-haiku-5-5";
/** Model 5.5 thinks before it answers: the limit must leave room for that (G0 lesson), the hint itself is short. */
export const HINT_MAX_TOKENS = 4000;
export const CHECK_MAX_TOKENS = 1500;

export const TUTOR_FLAGS = ["injection_attempt", "off_topic", "frustrated", "asked_answer", "word_meaning"] as const;
export type TutorFlag = (typeof TUTOR_FLAGS)[number];

export type TutorContext = {
  learnerId: string;
  familyId: string;
  item: { id: string; kind: string; stem: string; options: string[] };
  part: { key: string; name: string; instructions: string } | null;
  answers: string[];
  /** notice_version of the child's latest granted ai_text consent (null = none). */
  consentVersion: string | null;
  hintsUsed: number;
  turnsToday: number;
  dailyLimit: number;
  /** track_settings.tutor_language: "vi" | "en_first". */
  language: string;
  band: string;
  previous: { kind: string; level: number; child_text: string | null; shown_text: string }[];
};

/** Per language setting (track configuration, never the track id): how to explain and how long (G9). */
export const LANGUAGE_RULES: Record<string, { rule: string; length: string; maxLines: number }> = {
  vi: {
    rule: "Vietnamese only, short simple sentences for a 11–12 year old. English words or phrases from the question may stay in English.",
    length: "At most 4 short lines.",
    maxLines: 4,
  },
  en_first: {
    rule: "English first, at the child's level. You may add at most ONE short line in Vietnamese at the end if it really helps.",
    length: "At most 6 short lines.",
    maxLines: 6,
  },
};
export const languageRule = (lang: string) => LANGUAGE_RULES[lang] ?? LANGUAGE_RULES.vi!;

export const hintTool: ToolSpec = {
  name: "give_hint",
  description: "The one hint shown to the child, and flags about what the child typed.",
  input_schema: {
    type: "object",
    required: ["hint", "flags"],
    properties: {
      hint: { type: "string", description: "Plain text, a few short lines." },
      flags: { type: "array", items: { type: "string", enum: [...TUTOR_FLAGS] } },
    },
  },
};
export const checkTool: ToolSpec = {
  name: "check_hint",
  description: "Whether the hint may be shown to the child.",
  input_schema: {
    type: "object",
    required: ["pass", "reasons"],
    properties: {
      pass: { type: "boolean" },
      reasons: { type: "array", items: { type: "string", enum: ["reveals_answer", "confirms_or_denies", "off_topic", "unsafe"] } },
    },
  },
};

/** What the model must never write: the answers; for a choice question the right letter AND the text of that choice. */
export function forbiddenForPrompt(ctx: TutorContext): string[] {
  if (ctx.item.options.length === 0) return ctx.answers;
  const letter = (ctx.answers[0] ?? "").trim().toUpperCase();
  const option = ctx.item.options.find((o) => o.trim().toUpperCase().startsWith(`${letter}.`));
  return [`the choice ${letter}${option ? ` ("${option.trim().slice(2).trim()}")` : ""}`];
}

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => vars[k] ?? "");
const orNone = (s: string) => (s.trim() ? s.trim() : "(none)");

function partBits(ctx: TutorContext): { instructions: string; bank: string } {
  if (!ctx.part) return { instructions: "(none)", bank: "(none)" };
  const lead = leadOf({ ...ctx.part, items: [] });
  const text = [lead.title, lead.text].filter(Boolean).join(" — ");
  return { instructions: orNone(text), bank: lead.banks.length ? lead.banks.map((b) => `${b.label}: ${b.words.join(", ")}`).join("; ") : "(none)" };
}

export function buildHintCall(o: {
  template: string; model: string; ctx: TutorContext; level: number; childText: string | null; rewriteFor?: string[];
  toolChoice?: "tool" | "auto";
}): ToolCall {
  const { instructions, bank } = partBits(o.ctx);
  const lang = languageRule(o.ctx.language);
  const previous = o.ctx.previous.length
    ? o.ctx.previous.map((p) => `- ${p.child_text ? `child: "${p.child_text}" → ` : ""}${p.kind === "hint" ? `H${p.level}` : p.kind}: ${p.shown_text}`).join("\n")
    : "(none)";
  let instructionsText = fill(o.template, {
    BAND: o.ctx.band || "(unknown)",
    LANGUAGE_RULE: lang.rule,
    LENGTH_RULE: lang.length,
    KIND: o.ctx.item.kind,
    INSTRUCTIONS: instructions,
    BANK: bank,
    STEM: o.ctx.item.stem,
    OPTIONS: o.ctx.item.options.length ? o.ctx.item.options.join(" | ") : "(none)",
    ANSWERS: forbiddenForPrompt(o.ctx).map((a) => `- ${a}`).join("\n") || "- (none)",
    LEVEL: `H${o.level}`,
    CHILD_TEXT: o.childText ?? "",
    PREVIOUS: previous,
  });
  if (o.rewriteFor && o.rewriteFor.length) {
    instructionsText += `\n\nYOUR PREVIOUS HINT WAS REFUSED (${o.rewriteFor.join(", ")}). Write a new hint at the same level that avoids the answer and every piece of it.`;
  }
  return { model: o.model, documents: [], instructions: instructionsText, tool: hintTool, maxTokens: HINT_MAX_TOKENS, toolChoice: o.toolChoice ?? "auto" };
}

export function buildCheckCall(o: { template: string; model: string; ctx: TutorContext; hint: string; childText: string | null; toolChoice?: "tool" | "auto" }): ToolCall {
  const { bank } = partBits(o.ctx);
  return {
    model: o.model,
    documents: [],
    instructions: fill(o.template, {
      STEM: o.ctx.item.stem,
      OPTIONS: o.ctx.item.options.length ? o.ctx.item.options.join(" | ") : "(none)",
      BANK: bank,
      ANSWERS: forbiddenForPrompt(o.ctx).join(" / ") || "(none)",
      CHILD_TEXT: o.childText ?? "",
      HINT: o.hint,
    }),
    tool: checkTool,
    maxTokens: CHECK_MAX_TOKENS,
    toolChoice: o.toolChoice ?? "auto",
  };
}
