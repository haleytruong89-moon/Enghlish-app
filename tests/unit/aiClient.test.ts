import { describe, expect, it } from "vitest";
import { aiFake, studioModel, studioToolChoice } from "@/lib/ai/config";
import { loadPrompt, STUDIO_PROMPT } from "@/lib/ai/prompts";
import { AiCallError, buildRequestBody, postToolCall, type ToolCall } from "@/lib/ai/request";

const call: ToolCall = {
  model: "claude-sonnet-5-5",
  documents: [{ kind: "pdf", title: "ĐỀ", base64: "JVBERi0=" }, { kind: "text", title: "ĐÁP ÁN", text: "1B" }],
  instructions: "Gọi save_exercise đúng một lần.",
  tool: { name: "save_exercise", description: "d", input_schema: { type: "object" } },
  maxTokens: 32000,
  toolChoice: "tool",
};
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Messages API request (server only)", () => {
  it("documents first, then the instructions; forced tool or auto", () => {
    const b = buildRequestBody(call) as { tool_choice: unknown; messages: { content: { type: string; source?: { type: string } }[] }[] };
    expect(b.tool_choice).toEqual({ type: "tool", name: "save_exercise" });
    expect(b.messages[0]!.content.map((c) => [c.type, c.source?.type])).toEqual([["document", "base64"], ["document", "text"], ["text", undefined]]);
    expect((buildRequestBody({ ...call, toolChoice: "auto" }) as { tool_choice: unknown }).tool_choice).toEqual({ type: "auto" });
  });
  it("returns the tool input + usage; maps errors to codes without leaking the key", async () => {
    const ok = await postToolCall(call, { apiKey: "k", fetchImpl: reply(200, { model: "claude-sonnet-5-5", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "tool_use", name: "save_exercise", input: { items: [] } }] }) });
    expect(ok).toEqual({ input: { items: [] }, usage: { inputTokens: 10, outputTokens: 5 }, model: "claude-sonnet-5-5" });
    await expect(postToolCall(call, { apiKey: "secret-key", fetchImpl: reply(200, { usage: {}, content: [{ type: "text", text: "hi" }] }) })).rejects.toMatchObject({ code: "no_tool" });
    await expect(postToolCall(call, { apiKey: "k", fetchImpl: reply(400, { error: { message: "tool_choice is not supported" } }) })).rejects.toMatchObject({ code: "tool_choice" });
    await expect(postToolCall(call, { apiKey: "k", fetchImpl: reply(429, {}) })).rejects.toMatchObject({ code: "http_429" });
    await expect(postToolCall(call, { apiKey: "k", fetchImpl: reply(529, {}) })).rejects.toMatchObject({ code: "http_5xx" });
    const err = await postToolCall(call, { apiKey: "secret-key", fetchImpl: async () => { throw new Error("boom secret-key"); } }).then(() => null, (e: unknown) => e as AiCallError);
    expect(err?.code).toBe("network");
    expect(err?.message).not.toContain("secret-key");
  });
});

describe("config + prompt", () => {
  it("model, tool choice and the fake follow the environment; the fake never runs in production", () => {
    expect(studioModel({})).toBe("claude-sonnet-5-5");
    expect(studioModel({ STUDIO_EXTRACT_MODEL: "x" })).toBe("x");
    expect(studioToolChoice({})).toBe("tool");
    expect(studioToolChoice({ STUDIO_TOOL_CHOICE: "auto" })).toBe("auto");
    expect(aiFake({ AI_FAKE: "1" })).toBe(true);
    expect(aiFake({ AI_FAKE: "1", VERCEL_ENV: "production" })).toBe(false);
    // a production build never fakes the AI unless it is CI (the e2e app is a production build)
    expect(aiFake({ AI_FAKE: "1", NODE_ENV: "production" })).toBe(false);
    expect(aiFake({ AI_FAKE: "1", NODE_ENV: "production", CI: "true" })).toBe(true);
    expect(aiFake({ AI_FAKE: "1", NODE_ENV: "production", CI: "true", VERCEL_ENV: "production" })).toBe(false);
    expect(aiFake({ NODE_ENV: "development" })).toBe(false);
  });
  it("the versioned prompt exists, has the three list slots and asks for the key from the tutor's file", () => {
    const p = loadPrompt(STUDIO_PROMPT.file);
    for (const slot of ["{{TAGS}}", "{{READING_TAGS}}", "{{SKILLS}}"]) expect(p).toContain(slot);
    expect(p).toMatch(/không tự giải/i);
    expect(() => loadPrompt("../secrets")).toThrow();
  });
});
