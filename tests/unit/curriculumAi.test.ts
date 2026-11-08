import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createToolCaller } from "@/lib/ai/anthropic";
import { fakeFixtureFor } from "@/lib/ai/config";
import { CURRICULUM_PROMPT, loadPrompt } from "@/lib/ai/prompts";
import type { TocContext } from "@/lib/curriculum/context";
import { runTocExtraction, type TocExtractStore } from "@/lib/curriculum/extract";
import { buildTocCall, fillTocPrompt, TOC_TOOL_NAME, tocTool } from "@/lib/curriculum/tocTool";
import { checkFile } from "@/lib/storage/rules";

const CTX: TocContext = { tags: [{ key: "cum-dong-tu", label: "Cụm động từ", domain: "Từ vựng", group: "Kết hợp từ, cụm động từ, thành ngữ", custom: false }] };
const GATE = { familyId: "f", enabled: true, consent: true, spentUsd: 0, monthlyCapUsd: 10, softCapUsd: 8, softReached: false, allowed: true, reason: null, reservationId: "res" };

describe("curriculum-toc.v1 (prompt, tool, fake)", () => {
  it("the prompt file exists with its two slots; filled, it carries the book and the closed list only", () => {
    const text = loadPrompt(CURRICULUM_PROMPT.file);
    expect(text).toContain("{{BOOK}}");
    expect(text).toContain("{{TAGS}}");
    const filled = fillTocPrompt(text, CTX, { title: "Destination C1&C2", levelNote: "C1–C2" });
    expect(filled).toContain("Destination C1&C2 (C1–C2)");
    expect(filled).toContain("- cum-dong-tu — Cụm động từ (Từ vựng › Kết hợp từ, cụm động từ, thành ngữ)");
    expect(filled).not.toMatch(/Nguyên|An \(|alias/);
  });
  it("the forced tool only accepts keys of the closed list as points", () => {
    const t = tocTool(CTX) as unknown as { name: string; input_schema: { properties: { units: { items: { properties: { points: { items: { enum: string[] } } } } } } } };
    expect(t.name).toBe(TOC_TOOL_NAME);
    expect(t.input_schema.properties.units.items.properties.points.items.enum).toEqual(["cum-dong-tu"]);
    const call = buildTocCall({ model: "claude-sonnet-5-5", toolChoice: "tool", prompt: "{{BOOK}} {{TAGS}}", ctx: CTX, book: { title: "B", levelNote: null }, doc: { kind: "pdf", title: "MỤC LỤC", base64: "JVBERg==" } });
    expect([call.documents.length, call.toolChoice, call.maxTokens]).toEqual([1, "tool", 16000]);
  });
  it("AI_FAKE answers each tool with its own fixture; a table of contents is a PDF only", async () => {
    expect(fakeFixtureFor("save_curriculum_toc")).toBe("tests/fixtures/curriculum/fake-toc.json");
    expect(fakeFixtureFor("save_exercise")).toBe("tests/fixtures/studio/fake-extract.json");
    const call = createToolCaller({ AI_FAKE: "1", NODE_ENV: "test" });
    const r = await call(buildTocCall({ model: "m", toolChoice: "tool", prompt: "", ctx: CTX, book: { title: "B", levelNote: null }, doc: { kind: "pdf", title: "x", base64: "" } }));
    expect(r.input).toEqual(JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")));
    expect(checkFile("curriculum_toc", "application/pdf", 10)).toEqual({ ok: true });
    expect(checkFile("curriculum_toc", "image/png", 10)).toEqual({ ok: false, reason: "kind" });
  });
});

describe("runTocExtraction", () => {
  const store = (over: Partial<TocExtractStore> = {}): TocExtractStore & { runs: unknown[] } => {
    const runs: unknown[] = [];
    return { runs, gate: async () => GATE, reserve: async () => GATE, logRun: async (r) => (runs.push(r), `run-${runs.length}`), finish: vi.fn(async () => ({ applied: true })), fail: vi.fn(async () => ({ applied: true })), ...over };
  };
  const job = { versionId: "v", familyId: "f", learnerId: "l", byMemberId: "m", tocPath: "p", book: { title: "B", levelNote: null } };
  const base = { download: async () => new Uint8Array([1]), context: async () => CTX, model: "claude-sonnet-5-5", toolChoice: "tool" as const, prompt: { text: "{{BOOK}}{{TAGS}}", version: "curriculum-toc.v1" }, sleep: async () => undefined };
  it("bad output is retried and logged each time; the third failure marks the version ai_failed (→ Soạn tay)", async () => {
    const s = store();
    const out = await runTocExtraction({ ...base, store: s, call: async () => ({ input: { nope: 1 }, usage: { inputTokens: 10, outputTokens: 10 }, model: "x" }) }, job);
    expect(out).toEqual({ status: "failed", code: "bad_output", tries: 3 });
    expect(s.runs).toHaveLength(3);
    expect(s.fail).toHaveBeenCalledWith("v", "bad_output", "run-3");
  });
  it("the cap reached at reservation stops before any call", async () => {
    const s = store({ reserve: async () => ({ ...GATE, allowed: false, reason: "cap" as const }) });
    const call = vi.fn();
    expect(await runTocExtraction({ ...base, store: s, call }, job)).toMatchObject({ status: "failed", code: "ai_cap", tries: 0 });
    expect(call).not.toHaveBeenCalled();
  });
});
