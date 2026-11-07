import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import {
  handleApprove, handleCreateDraft, handleDecide, handleGetDraft, handlePending, handleSetAiSettings, handleAiSettings, handleStudioUploadUrl,
  type StudioDeps, type StudioStore,
} from "@/lib/studio/handlers";
import { normalizeExtract } from "@/lib/studio/normalize";
import { aiExtractSchema } from "@/lib/studio/schema";
import { CTX_B, FAKE_EXTRACT } from "./fixtures/studio";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const DRAFT = "d0000000-0000-4000-8000-000000000001";
const ATTEMPT = "c0000000-0000-4000-8000-000000000001";
const FILE = "e0000000-0000-4000-8000-0000000000f1";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: null, alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};
const payload = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), CTX_B);
const DRAFT_ROW = {
  id: DRAFT, learner_id: NGUYEN, family_id: FAMILY, track_id: "B", title: "Unit 5", status: "draft", error_code: null, payload,
  updated_at: "2026-11-05 03:00:00.123456+00", created_at: "2026-11-05T03:00:00Z", approved_at: null, approved_by_member: null,
  template_id: null, template_version: null, frame_id: null, supersedes_draft_id: null, superseded_by: null, stale: false,
  test_file: { id: FILE, mime: "application/pdf", path: `${FAMILY}/${NGUYEN}/${FILE}.pdf` }, key_file: null, ai_cost_usd: 0.12, assigned: [],
};
const GATE_ON = { family_id: FAMILY, enabled: true, consent: true, spent_usd: 1.5, monthly_cap_usd: 10, soft_cap_usd: 8, soft_reached: false, allowed: true, reason: null };

function store(over: Partial<StudioStore> = {}): StudioStore {
  return {
    getDraftLearnerId: vi.fn(async (id: string) => (id === DRAFT ? NGUYEN : null)),
    getAttemptLearnerId: vi.fn(async (id: string) => (id === ATTEMPT ? NGUYEN : null)),
    issueUploadTicket: vi.fn(async () => ({ issued: 1 })),
    aiGate: vi.fn(async () => GATE_ON),
    aiReserve: vi.fn(async () => ({ ...GATE_ON, reservation_id: null })),
    aiSettings: vi.fn(async () => ({ enabled: true, monthly_cap_usd: 10, soft_cap_usd: 8, spent_usd: 1.5, runs_month: 2, soft_reached: false, updated_at: null, learners: [] })),
    setAiSettings: vi.fn(async () => ({ enabled: false, monthly_cap_usd: 10, soft_cap_usd: 8, spent_usd: 1.5, runs_month: 2, soft_reached: false, updated_at: null, learners: [] })),
    logAiRun: vi.fn(async () => "run-1"),
    createDraft: vi.fn(async () => ({ id: DRAFT, status: "extracting", replayed: false })),
    editDraft: vi.fn(async () => ({ id: DRAFT, replayed: false })),
    draft: vi.fn(async () => DRAFT_ROW),
    drafts: vi.fn(async () => []),
    saveDraft: vi.fn(async () => ({ updated_at: "2026-11-05 03:01:00.000001+00" })),
    finishExtraction: vi.fn(async () => ({ applied: true })),
    failExtraction: vi.fn(async () => ({ applied: true })),
    discardDraft: vi.fn(async () => ({ id: DRAFT, status: "discarded" })),
    approveDraft: vi.fn(async () => ({ template_id: "B-ST-000001", version: 1, frame_id: "x" })),
    assign: vi.fn(async () => ({ instance_id: "i", activity_id: "a", replayed: false })),
    pending: vi.fn(async () => ({ count: 0, items: [] })),
    retryResults: vi.fn(async () => 0),
    decide: vi.fn(async () => ({ decided: 1, pending: 0, result: { recorded: true, correct: 5, in_app: 8 } })),
    ...over,
  };
}
function deps(user: string | null, s: StudioStore = store(), extra: Partial<StudioDeps> = {}): StudioDeps & { jobs: (() => Promise<void>)[] } {
  const jobs: (() => Promise<void>)[] = [];
  return {
    jobs,
    user: user ? { id: `u-${user}` } : null,
    store: s,
    storage: {
      createUpload: vi.fn(async (p: string) => ({ url: `https://upload/${p}` })),
      stat: vi.fn(async () => ({ bytes: 1234, mime: "application/pdf" })),
      createDownload: vi.fn(async () => "https://dl"),
      removeFolder: vi.fn(async () => 0),
      download: vi.fn(async () => new Uint8Array([1])),
    },
    access: { store: access, allowRealLearners: false, now: new Date("2026-11-05T08:00:00Z") },
    schedule: (job) => jobs.push(job),
    loadContext: async () => CTX_B,
    getAi: () => ({ call: async () => ({ input: FAKE_EXTRACT, usage: { inputTokens: 1, outputTokens: 1 }, model: "claude-sonnet-5-5" }), model: "claude-sonnet-5-5", toolChoice: "tool", prompt: { text: "{{TAGS}}", version: "studio-extract.v1" } }),
    docxToText: async () => "x",
    newId: () => FILE,
    ...extra,
  };
}
const pdf = { id: FILE, mime: "application/pdf", bytes: 1234 };

describe("Studio API (requireAccess first; tutor or parent of the child)", () => {
  it("students and the other child's tutor get nothing", async () => {
    expect((await handleGetDraft(deps("studentNguyen"), DRAFT)).status).toBe(403);
    expect((await handleGetDraft(deps("tutorAn"), DRAFT)).status).toBe(404);
    expect((await handleGetDraft(deps(null), DRAFT)).status).toBe(401);
    expect((await handleGetDraft(deps("parent"), "not-a-uuid")).status).toBe(404);
    expect((await handleStudioUploadUrl(deps("tutorAn"), NGUYEN, { purpose: "studio_test", mime: "application/pdf", bytes: 10 })).status).toBe(404);
  });

  it("upload: Word only for Studio files, a fresh path built from ids", async () => {
    const d = deps("tutorNguyen");
    const r = await handleStudioUploadUrl(d, NGUYEN, { purpose: "studio_key", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 10 });
    expect(r.status).toBe(201);
    expect((r.body as { upload_url: string }).upload_url).toBe(`https://upload/${FAMILY}/${NGUYEN}/${FILE}.docx`);
    expect((await handleStudioUploadUrl(d, NGUYEN, { purpose: "studio_test", mime: "image/png", bytes: 10 })).body).toMatchObject({ error: "file_type" });
    expect((await handleStudioUploadUrl(d, NGUYEN, { purpose: "studio_test", mime: "application/msword", bytes: 10 })).body).toMatchObject({ error: "file_type" });
  });

  it("create with AI: gate refused → 409 with the reason and a refused run in the ledger; allowed → extraction scheduled after the answer", async () => {
    const off = store({ aiGate: vi.fn(async () => ({ ...GATE_ON, allowed: false, reason: "cap", spent_usd: 10 })) });
    const refused = await handleCreateDraft(deps("parent", off), NGUYEN, { title: "Unit 5", mode: "ai", test_file: pdf, key_file: null, client_id: "client-0001" });
    expect(refused).toMatchObject({ status: 409, body: { error: "ai_cap" } });
    expect(off.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_cap", costUsd: 0 }));
    expect(off.createDraft).not.toHaveBeenCalled();

    const s = store();
    const d = deps("tutorNguyen", s);
    const ok = await handleCreateDraft(d, NGUYEN, { title: "Unit 5", mode: "ai", test_file: pdf, key_file: null, client_id: "client-0002" });
    expect(ok).toMatchObject({ status: 201, body: { id: DRAFT, status: "extracting" } });
    expect(d.jobs).toHaveLength(1);
    await d.jobs[0]!();
    expect(s.finishExtraction).toHaveBeenCalledTimes(1);
    // manual: no gate, no job
    const m = deps("tutorNguyen", store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: false })) }));
    expect((await handleCreateDraft(m, NGUYEN, { title: "Unit 5", mode: "manual", test_file: null, key_file: null, client_id: "client-0003" })).status).toBe(201);
    expect(m.jobs).toHaveLength(0);
  });

  it("the draft view: tutors never see AI cost or the month's spend; the parent does; stored paths never leave the server", async () => {
    const tutor = (await handleGetDraft(deps("tutorNguyen"), DRAFT)).body as { draft: { aiCostUsd: number | null }; gate: unknown; can_approve: boolean };
    expect(tutor.draft.aiCostUsd).toBeNull();
    expect(tutor.gate).toBeNull();
    expect(tutor.can_approve).toBe(false); // item 8 has no key
    expect(JSON.stringify(tutor)).not.toContain(`${FAMILY}/${NGUYEN}/`);
    const parent = (await handleGetDraft(deps("parent"), DRAFT)).body as { draft: { aiCostUsd: number | null }; gate: { spentUsd: number } };
    expect(parent.draft.aiCostUsd).toBe(0.12);
    expect(parent.gate.spentUsd).toBe(1.5);
  });

  it("a stale extraction is marked failed when read", async () => {
    const s = store({ draft: vi.fn().mockResolvedValueOnce({ ...DRAFT_ROW, status: "extracting", stale: true }).mockResolvedValue({ ...DRAFT_ROW, status: "ai_failed", error_code: "timeout" }) });
    const r = await handleGetDraft(deps("tutorNguyen", s), DRAFT, { view: "status" });
    expect(s.failExtraction).toHaveBeenCalledWith({ draftId: DRAFT, errorCode: "timeout", runId: null });
    expect(r.body).toEqual({ status: "ai_failed", error_code: "timeout" });
  });

  it("approve: blocked drafts get the blocking issues; a fixed draft is built and approved", async () => {
    const blocked = await handleApprove(deps("tutorNguyen"), DRAFT, { base_updated_at: DRAFT_ROW.updated_at });
    expect(blocked.status).toBe(400);
    expect(blocked.body).toMatchObject({ error: "blocked", issues: [{ n: 8, code: "missing_key", blocking: true }] });
    const fixed = { ...DRAFT_ROW, payload: { ...payload, items: payload.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i)) } };
    const s = store({ draft: vi.fn(async () => fixed) });
    expect((await handleApprove(deps("parent", s), DRAFT, { base_updated_at: DRAFT_ROW.updated_at })).status).toBe(200);
    expect(s.approveDraft).toHaveBeenCalledWith(expect.objectContaining({ draftId: DRAFT, base: DRAFT_ROW.updated_at, byMemberId: "m-parent" }));
    expect((await handleApprove(deps("parent", s), DRAFT, { base_updated_at: "2026-01-01T00:00:00.000000+00:00" })).body).toMatchObject({ error: "draft_changed" });
  });

  it("verdicts run the engine after a write; database tags become error codes", async () => {
    const afterWrite = vi.fn(async () => {});
    const ok = await handleDecide(deps("tutorNguyen", store(), { afterWrite }), ATTEMPT, { items: [{ item_id: "q8", result: "correct" }], client_id: "client-0009" });
    expect(ok.status).toBe(200);
    expect(afterWrite).toHaveBeenCalledWith(NGUYEN, null);
    const s = store({ decide: vi.fn(async () => { throw new ReviewDbError("23505", "eng_decide_studio_items: item q8 already has another verdict (already_decided)"); }) });
    expect((await handleDecide(deps("parent", s), ATTEMPT, { items: [{ item_id: "q8", result: "incorrect" }], client_id: "client-0010" })).body).toMatchObject({ error: "already_decided" });
    expect((await handleDecide(deps("tutorAn"), ATTEMPT, { items: [{ item_id: "q8", result: "correct" }], client_id: "client-0011" })).status).toBe(404);
  });

  it("AI settings: parent only", async () => {
    expect((await handleAiSettings(deps("tutorNguyen"))).body).toMatchObject({ error: "parent_only" });
    expect((await handleAiSettings(deps("parent"))).status).toBe(200);
    const s = store();
    expect((await handleSetAiSettings(deps("parent", s), { enabled: false })).status).toBe(200);
    expect(s.setAiSettings).toHaveBeenCalledWith({ enabled: false, noticeVersion: "ai-studio-v1", byMemberId: "m-parent" });
    expect((await handleSetAiSettings(deps("studentNguyen"), { enabled: true })).status).toBe(403);
  });

  it("preview isolation: with ALLOW_REAL_LEARNERS=false AI cannot be switched ON for a family that has a real learner (off is always allowed)", async () => {
    const withReal = store({ aiSettings: vi.fn(async () => ({ enabled: false, monthly_cap_usd: 10, soft_cap_usd: 8, spent_usd: 0, runs_month: 0, soft_reached: false, updated_at: null, learners: [{ id: AN, alias: "An", is_test: true, ai_text: null }, { id: NGUYEN, alias: "Nguyên", is_test: false, ai_text: null }] })) });
    expect(await handleSetAiSettings(deps("parent", withReal), { enabled: true })).toMatchObject({ status: 409, body: { error: "real_learners_blocked" } });
    expect(withReal.setAiSettings).not.toHaveBeenCalled();
    expect((await handleSetAiSettings(deps("parent", withReal), { enabled: false })).status).toBe(200);
  });

  it("pending inbox: staff only, real learners hidden on previews", async () => {
    const s = store();
    expect((await handlePending(deps("parent", s))).status).toBe(200);
    expect(s.pending).toHaveBeenCalledWith({ byMemberId: "m-parent", allowReal: false });
    expect(s.retryResults).toHaveBeenCalledWith({ byMemberId: "m-parent", allowReal: false }); // a result that failed to write once is retried when the inbox opens
    expect((await handlePending(deps("studentNguyen"))).status).toBe(403);
  });
});
