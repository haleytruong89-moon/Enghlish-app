import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createToolCaller } from "@/lib/ai/anthropic";
import { fakeFixtureFor } from "@/lib/ai/config";
import { loadPrompt, READ_ANSWERS_PROMPT } from "@/lib/ai/prompts";
import { buildRequestBody, estimateInputTokens } from "@/lib/ai/request";
import type { ReadContext } from "@/lib/import/context";
import { runReadExtraction, type ReadExtractStore } from "@/lib/import/extract";
import { gradeRead, normalizeRead } from "@/lib/import/normalize";
import { buildReadCall, fillReadPrompt, READ_TOOL_NAME, readAnswersTool } from "@/lib/import/readTool";
import { aiReadSchema, readPayloadSchema } from "@/lib/import/schema";

const tag = (key: string) => ({ key, label: key, domain: "Ngữ pháp", group: "G", custom: false, reading: false });
const CTX: ReadContext = { tags: ["cum-dong-tu", "thanh-ngu", "bi-dong-nho-tuong-thuat", "dang-tu", "tu-vung-ngu-canh", "modal-suy-doan", "cau-dieu-kien-dao-ngu", "wish-would-rather"].map(tag) };
const GATE = { familyId: "f", enabled: true, consent: true, spentUsd: 0, monthlyCapUsd: 10, softCapUsd: 8, softReached: false, allowed: true, reason: null, reservationId: "res" };
const FIXTURE = "tests/fixtures/import/fake-read-answers.json";

describe("read-answers.v1 (prompt, tool, fake)", () => {
  it("the prompt has its tag slot and nothing about the child", () => {
    const text = loadPrompt(READ_ANSWERS_PROMPT.file);
    expect(text).toContain("{{TAGS}}");
    expect(text).toMatch(/crossed out|corrections/i);
    const filled = fillReadPrompt(text, CTX);
    expect(filled).toContain("- cum-dong-tu — cum-dong-tu (Ngữ pháp › G)");
    expect(filled).not.toContain("{{");
  });
  it("the forced tool only accepts keys of the closed list as tag", () => {
    const t = readAnswersTool(CTX) as unknown as { name: string; input_schema: { properties: { questions: { items: { properties: { tag: { anyOf: { enum?: string[] }[] } } } } } } };
    expect(t.name).toBe(READ_TOOL_NAME);
    expect(t.input_schema.properties.questions.items.properties.tag.anyOf[0]!.enum).toContain("cum-dong-tu");
  });
  it("images become image blocks (with a text label); a PDF stays a document", () => {
    const call = buildReadCall({ model: "m", toolChoice: "tool", prompt: "{{TAGS}}", ctx: CTX, docs: [{ kind: "image", title: "BÀI LÀM", mediaType: "image/jpeg", base64: "AAAA" }, { kind: "pdf", title: "ĐÁP ÁN", base64: "JVBERg==" }] });
    const content = (buildRequestBody(call).messages as { content: { type: string }[] }[])[0]!.content.map((b) => b.type);
    expect(content).toEqual(["text", "image", "document", "text"]);
    expect(estimateInputTokens(call)).toBeGreaterThan(0);
  });
  it("the name of the test (even one filled in from a Unit) never reaches the AI: buildReadCall takes no title, and the document labels are fixed", () => {
    // The input DOES carry a title (extra property, as a careless caller could pass it): it must never reach the request.
    const input = { model: "m", toolChoice: "tool", prompt: "{{TAGS}}", ctx: CTX, docs: [{ kind: "pdf", title: "BÀI LÀM", base64: "JVBERg==" }], title: "Destination C1 · Unit 3" };
    const call = buildReadCall(input as Parameters<typeof buildReadCall>[0]);
    expect(JSON.stringify(input)).toContain("Destination C1 · Unit 3"); // the guard can fail: the title is really in the input
    expect(JSON.stringify(buildRequestBody(call))).not.toMatch(/Destination|Unit 3/);
    expect(JSON.stringify(call)).not.toMatch(/Destination|Unit \d/);
    expect(Object.keys(call).sort()).toEqual(["documents", "instructions", "maxTokens", "model", "tool", "toolChoice"]);
  });
  it("AI_FAKE answers the tool with the 60-question Progress Test fixture", async () => {
    expect(fakeFixtureFor(READ_TOOL_NAME)).toBe(FIXTURE);
    const call = createToolCaller({ AI_FAKE: "1", NODE_ENV: "test" });
    const r = await call(buildReadCall({ model: "m", toolChoice: "tool", prompt: "", ctx: CTX, docs: [] }));
    expect(aiReadSchema.safeParse(r.input).success).toBe(true);
  });
});

describe("grading is done by code", () => {
  it("compares after normalising, accepts alternatives, blank and unsure", () => {
    expect(gradeRead("Got.", "had | got", "high")).toBe("correct");
    expect(gradeRead("  OFF ", "across", "high")).toBe("incorrect");
    expect(gradeRead(null, "across", "high")).toBe("blank");
    expect(gradeRead("", "across", "high")).toBe("blank");
    expect(gradeRead("across", "across", "low")).toBe("needs_person");
    expect(gradeRead("across", null, "high")).toBe("needs_person");
  });
  it("drops a tag outside the closed list, never drops a duplicate (both rows stay as \"Cần xem\"), sorts by number", () => {
    const out = normalizeRead(
      aiReadSchema.parse({
        questions: [
          { n: 2, part: "A", student_answer: "B", key_answer: "B", tag: "khong-co", out_of_app: false, confidence: "high" },
          { n: 1, part: "A", student_answer: "B", key_answer: "C", tag: "cum-dong-tu", out_of_app: false, confidence: "high" },
          { n: 1, part: "A", student_answer: "C", key_answer: "C", tag: null, out_of_app: false, confidence: "high" },
        ],
      }),
      CTX,
    );
    expect(out.items.map((i) => [i.n, i.tag, i.result])).toEqual([[1, "cum-dong-tu", "needs_person"], [1, null, "needs_person"], [2, null, "correct"]]);
    expect(readPayloadSchema.safeParse(out).success).toBe(true);
  });
});

describe("runReadExtraction (AI_FAKE)", () => {
  const store = (over: Partial<ReadExtractStore> = {}) => {
    const runs: { draftId: string | null; promptVersion: string | null; status: string }[] = [];
    const finished: { payload: ReturnType<typeof normalizeRead> }[] = [];
    const s: ReadExtractStore = {
      gate: async () => GATE,
      reserve: async () => GATE,
      logRun: async (r) => (runs.push(r), `run-${runs.length}`),
      finish: async (_id, payload) => (finished.push({ payload }), { applied: true }),
      fail: vi.fn(async () => ({ applied: true })),
      ...over,
    };
    return { s, runs, finished };
  };
  const job = { batchId: "b", familyId: "f", learnerId: "l", byMemberId: "m", workFile: { path: "w", mime: "image/jpeg" }, keyFile: { path: "k", mime: "application/pdf" } };
  const base = { download: async () => new Uint8Array([1]), docxToText: async () => "key", context: async () => CTX, model: "claude-sonnet-5-5", toolChoice: "tool" as const, prompt: { text: "{{TAGS}}", version: "read-answers.v1" }, sleep: async () => undefined };

  it("reads the Progress Test: 60 items, q50 incorrect, q29 needs a person, q1 correct, 51 correct in all; one ai_runs row", async () => {
    const { s, runs, finished } = store();
    const out = await runReadExtraction({ ...base, store: s, call: createToolCaller({ AI_FAKE: "1", NODE_ENV: "test" }) }, job);
    expect(out).toEqual({ status: "ok", code: null, tries: 1 });
    const items = finished[0]!.payload.items;
    expect(items).toHaveLength(60);
    const by = (n: number) => items.find((i) => i.n === n)!;
    expect([by(50).result, by(50).tag]).toEqual(["incorrect", "cum-dong-tu"]);
    expect(by(29).result).toBe("needs_person");
    expect(by(1).result).toBe("correct");
    expect(by(16).result).toBe("correct");
    expect(items.filter((i) => i.result === "correct")).toHaveLength(51);
    expect(items.filter((i) => i.result === "needs_person")).toHaveLength(3);
    expect(runs).toEqual([expect.objectContaining({ draftId: "b", promptVersion: "read-answers.v1", status: "ok" })]);
    expect(JSON.parse(readFileSync(path.join(process.cwd(), FIXTURE), "utf8")).questions).toHaveLength(60);
  });
  it("bad output is retried and logged each time, then the batch is marked ai_failed", async () => {
    const { s, runs } = store();
    const out = await runReadExtraction({ ...base, store: s, call: async () => ({ input: { nope: 1 }, usage: { inputTokens: 10, outputTokens: 10 }, model: "x" }) }, job);
    expect(out).toEqual({ status: "failed", code: "bad_output", tries: 3 });
    expect(runs).toHaveLength(3);
    expect(s.fail).toHaveBeenCalledWith("b", "bad_output", "run-3");
  });
  it("a closed gate refuses before any call and nothing is read", async () => {
    const call = vi.fn();
    const { s } = store({ gate: async () => ({ ...GATE, allowed: false, reason: "off" as const }) });
    const out = await runReadExtraction({ ...base, store: s, call }, job);
    expect(out.status).toBe("refused");
    expect(call).not.toHaveBeenCalled();
    expect(s.fail).toHaveBeenCalledWith("b", "ai_off", null);
  });
  it("an unreadable file fails without a call", async () => {
    const call = vi.fn();
    const { s } = store();
    const out = await runReadExtraction({ ...base, store: s, call, download: async () => Promise.reject(new Error("x")) }, job);
    expect(out).toEqual({ status: "failed", code: "file_unreadable", tries: 0 });
    expect(call).not.toHaveBeenCalled();
  });
});
