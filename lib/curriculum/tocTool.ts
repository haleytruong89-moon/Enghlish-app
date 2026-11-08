/** The tool `save_curriculum_toc` (forced, spec §5) and the request of one "Đọc mục lục": the PDF + the closed list + the prompt. Pure. */
import type { AiDocument, ToolCall, ToolSpec } from "@/lib/ai/request";
import type { TocContext } from "./context";
import { IGNORED_REASONS } from "./types";

export const TOC_TOOL_NAME = "save_curriculum_toc";
export const TOC_DOC_TITLE = "MỤC LỤC";
export const TOC_MAX_TOKENS = 16000;

export function tocTool(ctx: TocContext): ToolSpec {
  const str = { type: "string" };
  return {
    name: TOC_TOOL_NAME,
    description: "Save the teaching units of the book's table of contents, in book order, each linked only to points of the given list.",
    input_schema: {
      type: "object",
      required: ["units", "ignored"],
      properties: {
        units: {
          type: "array",
          items: {
            type: "object",
            required: ["number", "title", "section", "page", "points", "missing_points", "needs_review", "review_reason"],
            properties: {
              number: { type: "string", description: "The unit number exactly as printed (\"7\"), or its label when there is no number." },
              title: str,
              section: { type: ["string", "null"], description: "e.g. Grammar / Vocabulary / Reading, as printed; null if none." },
              page: { type: ["integer", "null"] },
              points: { type: "array", items: { type: "string", enum: ctx.tags.map((t) => t.key) } },
              missing_points: { type: "array", items: str, description: "Points this unit teaches that are NOT in the list (short Vietnamese)." },
              needs_review: { type: "boolean" },
              review_reason: { type: ["string", "null"] },
            },
          },
        },
        ignored: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "page", "reason"],
            properties: { label: str, page: { type: ["integer", "null"] }, reason: { type: "string", enum: [...IGNORED_REASONS] } },
          },
        },
      },
    },
  };
}

/** The prompt with the book and the closed list in place: book title + level note + tag keys and names — nothing about the child. */
export function fillTocPrompt(template: string, ctx: TocContext, book: { title: string; levelNote: string | null }): string {
  const tags = ctx.tags.length
    ? ctx.tags.map((t) => `- ${t.key} — ${t.label}${t.domain ? ` (${t.domain}${t.group ? ` › ${t.group}` : ""})` : ""}`).join("\n")
    : "- (không có)";
  return template
    .replace("{{BOOK}}", book.levelNote ? `${book.title} (${book.levelNote})` : book.title)
    .replace("{{TAGS}}", tags);
}

export function buildTocCall(o: { model: string; toolChoice: "tool" | "auto"; prompt: string; ctx: TocContext; book: { title: string; levelNote: string | null }; doc: AiDocument }): ToolCall {
  return { model: o.model, documents: [o.doc], instructions: fillTocPrompt(o.prompt, o.ctx, o.book), tool: tocTool(o.ctx), maxTokens: TOC_MAX_TOKENS, toolChoice: o.toolChoice };
}
