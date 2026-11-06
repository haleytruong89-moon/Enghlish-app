import { describe, expect, it, vi } from "vitest";
import { AiCallError, type ToolCall } from "@/lib/ai/request";
import type { GateState } from "@/lib/ai/cap";
import { runExtraction, type ExtractDeps, type ExtractJob, type RunLog } from "@/lib/studio/extract";
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
    reserve: vi.fn(async (_a: { estimateUsd: number; learnerId: string; draftId: string; model: string; byMemberId: string }) => ({ ...gate, reservationId: gate.allowed ? "resv-1" : null })),
    logRun: vi.fn(async (_r: RunLog) => "run-1"),
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

  it("every iteration reserves the worst-case price first (retries and the tool_choice switch included) and settles that reservation", async () => {
    let n = 0;
    const { d, store } = deps(async () => {
      n += 1;
      if (n === 1) throw new AiCallError("tool_choice");
      if (n === 2) throw new AiCallError("http_5xx", { inputTokens: 5, outputTokens: 0 });
      return good();
    });
    expect((await runExtraction(d, job)).status).toBe("ok");
    expect(store.reserve).toHaveBeenCalledTimes(3);
    expect(store.reserve.mock.calls[0]![0]).toEqual(expect.objectContaining({ learnerId: LEARNER, draftId: job.draftId, model: "claude-sonnet-5-5", estimateUsd: expect.any(Number) }));
    expect(store.reserve.mock.calls[0]![0].estimateUsd).toBeGreaterThan(0);
    for (const c of store.logRun.mock.calls) expect(c[0]).toMatchObject({ releasesRunId: "resv-1" });
  });

  it("the cap reached between two tries (a refused reservation in the loop) stops the job: no further call", async () => {
    const { d, store, calls } = deps(async () => { throw new AiCallError("http_5xx", { inputTokens: 5, outputTokens: 0 }); });
    store.reserve.mockImplementationOnce(async () => ({ ...okGate, reservationId: "resv-1" })).mockImplementationOnce(async () => ({ ...okGate, allowed: false, reason: "cap", reservationId: null }));
    expect(await runExtraction(d, job)).toEqual({ status: "failed", code: "ai_cap", tries: 1 });
    expect(calls).toHaveLength(1);
    expect(store.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_cap", costUsd: 0 }));
  });

  it("a timeout or a 5xx without usage is logged with the ESTIMATED input cost, not 0", async () => {
    const { d, store } = deps(async () => { throw new AiCallError("timeout"); });
    await runExtraction({ ...d, maxTries: 1 }, job);
    const row = store.logRun.mock.calls[0]![0];
    expect(row.status).toBe("error");
    expect(row.inputTokens).toBeGreaterThan(0);
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it("per-call timeout = min(240 s, remaining - 20 s); with less than 60 s left no call is started", async () => {
    const seen: (number | undefined)[] = [];
    const { d, store } = deps(good);
    const timed = { ...d, now: () => 0, call: async (c: ToolCall, o?: { timeoutMs?: number }) => { seen.push(o?.timeoutMs); return good(); }, budgetMs: 100_000 };
    await runExtraction(timed, job);
    expect(seen).toEqual([80_000]);
    let ticks = 0; // started at 0, then 50 s later: 50 s left of 100 s is too little
    const { d: d2, store: s2 } = deps(good);
    expect(await runExtraction({ ...d2, now: () => (ticks++ === 0 ? 0 : 50_000), budgetMs: 100_000 }, job)).toEqual({ status: "failed", code: "timeout", tries: 0 });
    expect(s2.fail).toHaveBeenCalledWith(job.draftId, "timeout", null);
    expect(store.reserve).toHaveBeenCalledTimes(1);
  });

  it("a model with no price is refused before anything is read or reserved", async () => {
    const { d, store, calls } = deps(good);
    expect(await runExtraction({ ...d, model: "claude-unknown-9" }, job)).toEqual({ status: "refused", code: "ai_model", tries: 0 });
    expect(calls).toHaveLength(0);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(store.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_model", costUsd: 0 }));
  });
});
