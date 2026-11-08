/** The tool `save_read_answers` (forced) and the request of one "Cho AI đọc bài": the work + the key + the prompt + the closed list. Pure. */
import type { AiDocument, ToolCall, ToolSpec } from "@/lib/ai/request";
import type { ReadContext } from "./context";
import { IMPORT_LIMITS } from "./types";

export const READ_TOOL_NAME = "save_read_answers";
export const WORK_DOC_TITLE = "BÀI LÀM";
export const KEY_DOC_TITLE = "ĐÁP ÁN";
export const READ_MAX_TOKENS = 16000;

export function readAnswersTool(ctx: ReadContext): ToolSpec {
  const nullableStr = { type: ["string", "null"] };
  return {
    name: READ_TOOL_NAME,
    description: "Save, for every question of the test, the student's original answer, the key's answer, the tag and how sure the reading is.",
    input_schema: {
      type: "object",
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          maxItems: IMPORT_LIMITS.questions,
          items: {
            type: "object",
            required: ["n", "part", "student_answer", "key_answer", "tag", "out_of_app", "confidence"],
            properties: {
              n: { type: "integer" },
              part: { type: "string" },
              student_answer: nullableStr,
              key_answer: nullableStr,
              tag: { anyOf: [{ type: "string", enum: ctx.tags.map((t) => t.key) }, { type: "null" }] },
              out_of_app: { type: "boolean" },
              confidence: { type: "string", enum: ["high", "low"] },
            },
          },
        },
      },
    },
  };
}

/** The prompt with the closed list in place. Nothing typed by a person goes to the AI (not even the test title): nothing about the child. */
export function fillReadPrompt(template: string, ctx: ReadContext): string {
  const tags = ctx.tags.length
    ? ctx.tags.map((t) => `- ${t.key} — ${t.label}${t.domain ? ` (${t.domain}${t.group ? ` › ${t.group}` : ""})` : ""}`).join("\n")
    : "- (không có)";
  return template.replace("{{TAGS}}", () => tags);
}

export function buildReadCall(o: { model: string; toolChoice: "tool" | "auto"; prompt: string; ctx: ReadContext; docs: AiDocument[] }): ToolCall {
  return { model: o.model, documents: o.docs, instructions: fillReadPrompt(o.prompt, o.ctx), tool: readAnswersTool(o.ctx), maxTokens: READ_MAX_TOKENS, toolChoice: o.toolChoice };
}
