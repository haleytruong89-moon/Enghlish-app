import { describe, expect, it, vi } from "vitest";
import { AiCallError, type ToolCall } from "@/lib/ai/request";
import type { GateState } from "@/lib/ai/cap";
import { runExtraction, type ExtractDeps, type ExtractJob } from "@/lib/studio/extract";
import { CTX_B, FAKE_EXTRACT } from "./fixtures/studio";

const LEARNER = "e0000000-0000-4000-8000-00000000b001";
const FAMILY = "e0000000-0000-4000-8000-000000000001";
const MEMBER = "e0000000-0000-4000-8000-0000000000aa";
const job: ExtractJob = {
  draftId: "d0000000-0000-4000-8000-000000000001", familyId: FAMILY, learnerId: LEARNER, byMemberId: MEMBER,
  testFile: { path: `${FAMILY}/${LEARNER}/f1.pdf`, mime: "application/pdf" },
  keyFile: { path: `${FAMILY}/${LEARNER}/f2.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};
const okGate: GateState = { familyId: FAMILY, enabled: true, consent: true, spentUsd: 1, monthlyCapUsd: 10, softCapUsd: 8, softReached: false, allowed: true, reason: null };

function deps(call: ExtractDeps["call"], gate = okGate) {
  const calls: ToolCall[] = [];
  const store = {
    gate: vi.fn(async () => gate),
    logRun: vi.fn(async () => "run-1"),
    finish: vi.fn(async () => ({ applied: true })),
    fail: vi.fn(async () => ({ applied: true })),
  };
  const d: ExtractDeps = {
    store,
    download: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    docxToText: vi.fn(async () => "Đáp án: 1B 2A"),
    context: async () => CTX_B,
    call: async (c) => {
      calls.push(c);
      return call(c);
    },
    model: "claude-sonnet-5-5",
    toolChoice: "tool",
    prompt: { text: "Tags: {{TAGS}}\nReading: {{READING_TAGS}}\nSkills: {{SKILLS}}", version: "studio-extract.v1" },
    sleep: async () => {},
  };
  return { d, store, calls };
}
const good = async () => ({ input: FAKE_EXTRACT, usage: { inputTokens: 20_000, outputTokens: 8_000 }, model: "claude-sonnet-5-5" });

describe("runExtraction (spec §3 step 2, §5)", () => {
  it("one good reply → a clean draft is saved, the run is logged with its estimated cost; only files + lists are sent", async () => {
    const { d, store, calls } = deps(good);
    expect(await runExtraction(d, job)).toEqual({ status: "ok", code: null, tries: 1 });
    expect(store.finish).toHaveBeenCalledTimes(1);
    const [draftId, payload, runId] = store.finish.mock.calls[0] as unknown as [string, { items: { n: number }[] }, string];
    expect([draftId, runId, payload.items.length]).toEqual([job.draftId, "run-1", 9]);
    expect(store.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", inputTokens: 20_000, outputTokens: 8_000, costUsd: expect.any(Number) }));
    const sent = JSON.stringify(calls[0]);
    for (const secret of [LEARNER, FAMILY, MEMBER, job.draftId, "Nguyên", "An (thử)"]) expect(sent, secret).not.toContain(secret);
    expect(calls[0]!.documents.map((x) => x.kind)).toEqual(["pdf", "text"]);
    expect(calls[0]!.instructions).toContain("doc-inference — Make Inferences — Suy luận");
    expect(calls[0]!.instructions).not.toContain("thanh-ngu"); // far from the current level: not sent (D8)
  });

  it("≤ 3 tries: bad output and errors are logged one by one; then the draft fails with the last code", async () => {
    const { d, store } = deps(async () => { throw new AiCallError("http_5xx", { inputTokens: 5, outputTokens: 0 }); });
    expect(await runExtraction(d, job)).toEqual({ status: "failed", code: "http_5xx", tries: 3 });
    expect(store.logRun).toHaveBeenCalledTimes(3);
    expect(store.fail).toHaveBeenCalledWith(job.draftId, "http_5xx", "run-1");
    const { d: d2, store: s2 } = deps(async () => ({ input: { nonsense: true }, usage: { inputTokens: 1, outputTokens: 1 }, model: "m" }));
    expect((await runExtraction(d2, job)).code).toBe("bad_output");
    expect(s2.finish).not.toHaveBeenCalled();
  });

  it("a forced tool refused by the API → the next try uses auto (P6)", async () => {
    let n = 0;
    const { d, calls } = deps(async () => {
      n += 1;
      if (n === 1) throw new AiCallError("tool_choice");
      return good();
    });
    expect((await runExtraction(d, job)).status).toBe("ok");
    expect(calls.map((c) => c.toolChoice)).toEqual(["tool", "auto"]);
  });

  it("AI off / no consent / cap → no call, a refused run, the draft fails with the reason", async () => {
    const { d, store, calls } = deps(good, { ...okGate, allowed: false, reason: "cap", spentUsd: 10 });
    expect(await runExtraction(d, job)).toEqual({ status: "refused", code: "ai_cap", tries: 0 });
    expect(calls).toHaveLength(0);
    expect(store.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_cap", costUsd: 0 }));
    expect(store.fail).toHaveBeenCalledWith(job.draftId, "ai_cap", null);
  });
});
