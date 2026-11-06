// lib/ai/anthropic.ts
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AI_FAKE_FIXTURE, aiFake } from "./config";
import { AiCallError, postToolCall, type CallOptions, type ToolCall, type ToolResult } from "./request";

/**
 * The only place that reads ANTHROPIC_API_KEY (Vercel env, server only). With AI_FAKE=1 (tests, CI) the fixture comes back and nothing
 * leaves the machine. Without a key every call fails with http_401 (the draft then offers "Soạn tay").
 */
export function createToolCaller(env: Record<string, string | undefined> = process.env): (c: ToolCall, o?: CallOptions) => Promise<ToolResult> {
  if (aiFake(env)) {
    return async (c) => ({
      input: JSON.parse(readFileSync(path.join(process.cwd(), AI_FAKE_FIXTURE), "utf8")) as unknown,
      usage: { inputTokens: 1000, outputTokens: 500 },
      model: c.model,
    });
  }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return async () => Promise.reject(new AiCallError("http_401"));
  return (c, o) => postToolCall(c, { apiKey: key, timeoutMs: o?.timeoutMs });
}
