import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import type { TocContext } from "@/lib/curriculum/context";
import {
  handleApproveVersion, handleCreateCurriculum, handleGetVersion, handleSetUnitStatus, handleTocUploadUrl, type CurriculumDeps, type CurriculumStore,
} from "@/lib/curriculum/handlers";
import { normalizeToc } from "@/lib/curriculum/normalize";
import { aiTocSchema, type CurriculumPayload } from "@/lib/curriculum/schema";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const CUR = "c0000000-0000-4000-8000-0000000000c1";
const VER = "d0000000-0000-4000-8000-0000000000d1";
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
const FAKE = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")) as unknown;
const CTX: TocContext = {
  tags: ["cau-dieu-kien-dao-ngu", "wish-would-rather", "modal-suy-doan", "bi-dong-nho-tuong-thuat", "dang-tu", "tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "tu-noi-lap-luan"]
    .map((key) => ({ key, label: key, domain: null, group: null, custom: false })),
};
const AI_DRAFT = normalizeToc(aiTocSchema.parse(FAKE), CTX);
const resolved = (p: CurriculumPayload): CurriculumPayload => ({ ...p, units: p.units.map((u) => ({ ...u, needs_review: false })) });
const versionRow = (payload: CurriculumPayload, over: Record<string, unknown> = {}) => ({
  version: {
    id: VER, curriculum_id: CUR, learner_id: NGUYEN, version: 1, source: "ai", status: "draft", payload, ai_payload: AI_DRAFT, error_code: null,
    updated_at: "2026-11-08 03:00:00.123456+00", approved_at: null, review: null, created_at: "2026-11-08T03:00:00Z", ...over,
  },
  curriculum: { id: CUR, learner_id: NGUYEN, title: "Destination C1&C2", level_note: "C1–C2" },
  ai_cost_usd: 0.0421,
});
const GATE_ON = { family_id: FAMILY, enabled: true, consent: true, spent_usd: 1.5, monthly_cap_usd: 10, soft_cap_usd: 8, soft_reached: false, allowed: true, reason: null };

function store(over: Partial<CurriculumStore> = {}): CurriculumStore {
  return {
    getCurriculum: vi.fn(async (id: string) => (id === CUR ? { learner_id: NGUYEN, title: "Destination C1&C2", level_note: "C1–C2" } : null)),
    getVersionLearnerId: vi.fn(async (id: string) => (id === VER ? NGUYEN : null)),
    issueUploadTicket: vi.fn(async () => ({ issued: 1 })),
    aiGate: vi.fn(async () => GATE_ON),
    aiReserve: vi.fn(async () => ({ ...GATE_ON, reservation_id: "res-1" })),
    logAiRun: vi.fn(async () => "run-1"),
    create: vi.fn(async () => ({ curriculum_id: CUR, version_id: VER, status: "extracting", replayed: false })),
    addVersion: vi.fn(async () => ({ version_id: VER, status: "draft", replayed: false })),
    edit: vi.fn(async () => ({ id: VER, replayed: false })),
    version: vi.fn(async () => versionRow(AI_DRAFT)),
    save: vi.fn(async () => ({ updated_at: "2026-11-08 03:01:00.000001+00" })),
    finish: vi.fn(async () => ({ applied: true })),
    fail: vi.fn(async () => ({ applied: true })),
    discard: vi.fn(async () => ({ id: VER, status: "discarded" })),
    approve: vi.fn(async () => ({ version_id: VER, version: 1, units: 26 })),
    setUnitStatus: vi.fn(async () => ({ id: "ev-1", replayed: false })),
    ...over,
  };
}
function deps(user: string | null, s: CurriculumStore = store()): CurriculumDeps & { jobs: (() => Promise<void>)[] } {
  const jobs: (() => Promise<void>)[] = [];
  return {
    jobs,
    user: user ? { id: `u-${user}` } : null,
    store: s,
    storage: {
      createUpload: vi.fn(async (p: string) => ({ url: `https://upload/${p}` })),
      stat: vi.fn(async () => ({ bytes: 2048, mime: "application/pdf" })),
      createDownload: vi.fn(async () => "https://dl"),
      removeFolder: vi.fn(async () => 0),
      download: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    },
    access: { store: access, allowRealLearners: false, now: new Date("2026-11-08T08:00:00Z") },
    schedule: (job) => jobs.push(job),
    loadContext: async () => CTX,
    getAi: () => ({ call: async () => ({ input: FAKE, usage: { inputTokens: 900, outputTokens: 2400 }, model: "claude-sonnet-5-5" }), model: "claude-sonnet-5-5", toolChoice: "tool", prompt: { text: "{{BOOK}}\n{{TAGS}}", version: "curriculum-toc.v1" } }),
    newId: () => FILE,
  };
}
const pdf = { id: FILE, mime: "application/pdf", bytes: 2048 };
const create = (who: string, s = store(), body: Record<string, unknown> = {}) =>
  handleCreateCurriculum(deps(who, s), NGUYEN, { title: "Destination C1&C2", level_note: "C1–C2", mode: "ai", toc_file: pdf, client_id: "cur-00000001", ...body });

describe("curriculum API — access", () => {
  it("students, the other child's tutor and anonymous get nothing", async () => {
    expect((await handleGetVersion(deps("studentNguyen"), VER)).status).toBe(403);
    expect((await handleGetVersion(deps("tutorAn"), VER)).status).toBe(404);
    expect((await handleGetVersion(deps(null), VER)).status).toBe(401);
    expect((await handleTocUploadUrl(deps("tutorAn"), NGUYEN, { mime: "application/pdf", bytes: 10 })).status).toBe(404);
  });
  it("the table of contents must be a PDF", async () => {
    expect((await handleTocUploadUrl(deps("parent"), NGUYEN, { mime: "image/png", bytes: 10 })).body).toMatchObject({ error: "file_type" });
    expect((await handleTocUploadUrl(deps("tutorNguyen"), NGUYEN, { mime: "application/pdf", bytes: 10 })).status).toBe(201);
  });
});

describe("Cho AI đọc mục lục", () => {
  it("tutor or parent starts it; the job reserves, logs ONE ok run with purpose prompt version and saves the 26-unit draft", async () => {
    const s = store();
    const d = deps("parent", s);
    const r = await handleCreateCurriculum(d, NGUYEN, { title: "Destination C1&C2", level_note: "C1–C2", mode: "ai", toc_file: pdf, client_id: "cur-00000001" });
    expect(r).toMatchObject({ status: 201, body: { version_id: VER, status: "extracting", curriculum_id: CUR } });
    expect(d.jobs).toHaveLength(1);
    await d.jobs[0]!();
    expect(s.aiReserve).toHaveBeenCalledWith(expect.objectContaining({ versionId: VER, model: "claude-sonnet-5-5" }));
    expect(s.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", promptVersion: "curriculum-toc.v1", draftId: VER, releasesRunId: "res-1" }));
    const saved = (s.finish as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { payload: CurriculumPayload };
    expect(saved.payload.units.map((u) => u.code)).toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
  });
  it("AI off → 409 ai_off and a refused run is logged; Soạn tay still works without a file; AI without a file → 400", async () => {
    const s = store({ aiGate: vi.fn(async () => ({ ...GATE_ON, enabled: false, allowed: false, reason: "off" })) });
    expect((await create("tutorNguyen", s)).body).toMatchObject({ error: "ai_off" });
    expect(s.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_off" }));
    expect((await create("tutorNguyen", store({ create: vi.fn(async () => ({ curriculum_id: CUR, version_id: VER, status: "draft", replayed: false })) }), { mode: "manual", toc_file: null })).status).toBe(201);
    expect((await create("tutorNguyen", store(), { toc_file: null })).body).toMatchObject({ error: "toc_file_required" });
  });
});

describe("Duyệt (the child's tutor only — D-W8)", () => {
  const base = "2026-11-08 03:00:00.123456+00";
  it("refused while rows still need a look; a parent is refused; the tutor approves the kept rows with the edit count", async () => {
    expect((await handleApproveVersion(deps("tutorNguyen"), VER, { base_updated_at: base, quality: null, quality_note: null })).body).toMatchObject({ error: "blocked" });
    const s = store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) });
    expect((await handleApproveVersion(deps("parent", s), VER, { base_updated_at: base, quality: "good", quality_note: null })).body).toMatchObject({ error: "tutor_only" });
    const r = await handleApproveVersion(deps("tutorNguyen", s), VER, { base_updated_at: base, quality: "good", quality_note: "Đọc đúng hết" });
    expect(r).toEqual({ status: 200, body: { version: 1, units: 26 } });
    const arg = (s.approve as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { units: unknown[]; review: { stats: { ai_rows: number; kept: number }; quality: string } };
    expect(arg.units).toHaveLength(26);
    expect(arg.review).toMatchObject({ stats: { ai_rows: 26, kept: 26 }, quality: "good" });
  });
  it("approving a version and changing a Unit status recompute the child's points (fail-soft hook)", async () => {
    const points = vi.fn(async () => undefined);
    const s = store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) });
    const d = { ...deps("tutorNguyen", s), afterPoints: points };
    await handleApproveVersion(d, VER, { base_updated_at: base, quality: "good", quality_note: null });
    expect(points).toHaveBeenCalledWith(NGUYEN, null);
    points.mockClear();
    await handleSetUnitStatus(d, CUR, { unit_code: "U1", status: "done", lesson_note_id: null, client_id: "ev-00000002" });
    expect(points).toHaveBeenCalledWith(NGUYEN, null);
  });
  it("a stale base → 409; database tags map to codes", async () => {
    const s = store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) });
    expect((await handleApproveVersion(deps("tutorNguyen", s), VER, { base_updated_at: "2026-11-08 02:00:00+00", quality: null, quality_note: null })).status).toBe(409);
    const bad = store({ setUnitStatus: vi.fn(async () => Promise.reject(new ReviewDbError("23514", "eng_set_unit_status: x (unknown_unit)"))) });
    expect((await handleSetUnitStatus(deps("tutorNguyen", bad), CUR, { unit_code: "U99", status: "done", lesson_note_id: null, client_id: "ev-00000001" })).body).toMatchObject({ error: "unknown_unit" });
  });
  it("GET: a tutor never sees the AI cost; the parent does; can_approve only for the tutor", async () => {
    const t = (await handleGetVersion(deps("tutorNguyen"), VER)).body as { version: { aiCostUsd: number | null }; can_approve: boolean; rows_to_resolve: number };
    expect([t.version.aiCostUsd, t.rows_to_resolve, t.can_approve]).toEqual([null, 8, false]);
    const p = (await handleGetVersion(deps("parent", store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) })), VER)).body as { version: { aiCostUsd: number }; can_approve: boolean };
    expect([p.version.aiCostUsd, p.can_approve]).toEqual([0.0421, false]);
  });
});
