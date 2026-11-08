// lib/ai/request.ts
/**
 * One call of the Anthropic Messages API with ONE tool (spec §5.1–§5.3). Pure apart from `fetch` (injectable): the API key is a parameter,
 * never logged, never part of an error. lib/ai/anthropic.ts (server-only) supplies the key.
 */
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";
export type AiDocument =
  | { kind: "pdf"; title: string; base64: string }
  | { kind: "text"; title: string; text: string }
  /** A photo or screenshot (W3 "Nạp bài đã làm"): sent as an image block, preceded by a text block carrying its title. */
  | { kind: "image"; title: string; mediaType: ImageMediaType; base64: string };
export type ToolSpec = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolCall = { model: string; documents: AiDocument[]; instructions: string; tool: ToolSpec; maxTokens: number; toolChoice: "tool" | "auto" };
export type Usage = { inputTokens: number; outputTokens: number };
export type CallOptions = { timeoutMs?: number };
export type ToolResult = { input: unknown; usage: Usage; model: string };
export type AiErrorCode = "http_400" | "tool_choice" | "http_401" | "http_429" | "http_5xx" | "network" | "timeout" | "no_tool";

export class AiCallError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    public readonly usage: Usage = { inputTokens: 0, outputTokens: 0 },
  ) {
    super(`ai call failed: ${code}`);
    this.name = "AiCallError";
  }
}

export function buildRequestBody(c: ToolCall): Record<string, unknown> {
  return {
    model: c.model,
    max_tokens: c.maxTokens,
    tools: [c.tool],
    tool_choice: c.toolChoice === "tool" ? { type: "tool", name: c.tool.name } : { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          ...c.documents.flatMap((d): Record<string, unknown>[] =>
            d.kind === "pdf"
              ? [{ type: "document", title: d.title, source: { type: "base64", media_type: "application/pdf", data: d.base64 } }]
              : d.kind === "image"
                ? [{ type: "text", text: d.title }, { type: "image", source: { type: "base64", media_type: d.mediaType, data: d.base64 } }]
                : [{ type: "document", title: d.title, source: { type: "text", media_type: "text/plain", data: d.text } }],
          ),
          { type: "text", text: c.instructions },
        ],
      },
    ],
  };
}

type ApiBody = { model?: string; usage?: { input_tokens?: number; output_tokens?: number }; content?: { type: string; name?: string; input?: unknown }[]; error?: unknown };

export async function postToolCall(c: ToolCall, opts: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<ToolResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 240_000);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": opts.apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify(buildRequestBody(c)),
      signal: ctrl.signal,
    });
  } catch {
    throw new AiCallError(ctrl.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as ApiBody | null;
  const usage: Usage = { inputTokens: Number(body?.usage?.input_tokens ?? 0) || 0, outputTokens: Number(body?.usage?.output_tokens ?? 0) || 0 };
  if (!res.ok) {
    const msg = JSON.stringify(body?.error ?? "").toLowerCase();
    if (res.status === 400 && msg.includes("tool_choice")) throw new AiCallError("tool_choice", usage);
    if (res.status === 401 || res.status === 403) throw new AiCallError("http_401", usage);
    if (res.status === 429) throw new AiCallError("http_429", usage);
    throw new AiCallError(res.status >= 500 ? "http_5xx" : "http_400", usage);
  }
  const use = body?.content?.find((x) => x.type === "tool_use" && x.name === c.tool.name);
  if (!use) throw new AiCallError("no_tool", usage);
  return { input: use.input, usage, model: String(body?.model ?? c.model) };
}

/**
 * Rough input size of a call in tokens (text and tool schema: 3 characters per token; a PDF: 3 bytes per token), never more than 200 000.
 * Used to reserve the worst-case price before a call and to price a call that timed out without a usage report.
 */
export function estimateInputTokens(c: ToolCall): number {
  const chars = c.documents.reduce((n, d) => n + (d.kind === "text" ? d.text.length : Math.ceil(d.base64.length * 0.75)), 0) + c.instructions.length + JSON.stringify(c.tool).length;
  return Math.min(200_000, Math.ceil(chars / 3));
}
