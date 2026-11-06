/** The tool `save_exercise` (forced, spec §5.3) and the request of one extraction: the two documents + the lists + the prompt. Pure. */
import type { AiDocument, ToolCall, ToolSpec } from "@/lib/ai/request";
import { aiTagList, type StudioContext } from "./context";
import { STUDIO_ITEM_KINDS } from "./schema";

export const TEST_DOC_TITLE = "ĐỀ";
export const KEY_DOC_TITLE = "ĐÁP ÁN của thầy/cô";
export const EXTRACT_MAX_TOKENS = 32000;

const nullableEnum = (values: string[]) => ({ type: ["string", "null"], enum: [...values, null] });

export function saveExerciseTool(ctx: StudioContext): ToolSpec {
  const tags = aiTagList(ctx);
  const str = { type: "string" };
  return {
    name: "save_exercise",
    description: "Save the structured exercise extracted from the test and the tutor's answer key.",
    input_schema: {
      type: "object",
      required: ["parts", "passages", "items"],
      properties: {
        title: str,
        parts: { type: "array", items: { type: "object", required: ["key", "name", "instructions"], properties: { key: str, name: str, instructions: str } } },
        passages: { type: "array", items: { type: "object", required: ["ref", "title", "text"], properties: { ref: str, title: str, text: str } } },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["n", "part", "kind", "out_of_app", "stem", "options", "passage_ref", "key", "accepted", "tag_key", "target_id", "reading_skill_key", "explanation_vi", "needs_review", "review_reason"],
            properties: {
              n: { type: "integer", description: "The number printed on the test (never renumber)." },
              part: str,
              kind: { type: "string", enum: [...STUDIO_ITEM_KINDS] },
              out_of_app: { type: "boolean" },
              stem: str,
              options: { type: "array", items: { type: "object", required: ["letter", "text"], properties: { letter: str, text: str } } },
              passage_ref: { type: ["string", "null"] },
              key: { type: ["string", "null"], description: "From the tutor's answer key only: the option letter for mcq, else the exact words." },
              accepted: { type: "array", items: str },
              tag_key: nullableEnum(tags.filter((t) => !t.reading).map((t) => t.key)),
              target_id: nullableEnum(ctx.skills.map((s) => s.id)),
              reading_skill_key: nullableEnum(tags.filter((t) => t.reading).map((t) => t.key)),
              explanation_vi: str,
              needs_review: { type: "boolean" },
              review_reason: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  };
}

/** The prompt with the child's lists in place: keys and names only — nothing about the child (spec §5.2). */
export function fillPrompt(template: string, ctx: StudioContext): string {
  const tags = aiTagList(ctx);
  const lines = (xs: { a: string; b: string }[]) => (xs.length ? xs.map((x) => `- ${x.a} — ${x.b}`).join("\n") : "- (không có)");
  return template
    .replace("{{TAGS}}", lines(tags.filter((t) => !t.reading).map((t) => ({ a: t.key, b: t.label }))))
    .replace("{{READING_TAGS}}", lines(tags.filter((t) => t.reading).map((t) => ({ a: t.key, b: t.label }))))
    .replace("{{SKILLS}}", lines(ctx.skills.map((s) => ({ a: s.id, b: s.label }))));
}

export function buildExtractCall(o: { model: string; toolChoice: "tool" | "auto"; prompt: string; ctx: StudioContext; docs: AiDocument[] }): ToolCall {
  return { model: o.model, documents: o.docs, instructions: fillPrompt(o.prompt, o.ctx), tool: saveExerciseTool(o.ctx), maxTokens: EXTRACT_MAX_TOKENS, toolChoice: o.toolChoice };
}
