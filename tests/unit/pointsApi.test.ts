import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import type { PointEngineStore } from "@/lib/engine/points/runner";
import { buildImport } from "@/lib/import/build";
import type { ReadContext } from "@/lib/import/context";
import { handleConfirmImport, handleCreateImport, handleGetImport, handleImportUploadUrl, type ImportDeps, type ImportStore } from "@/lib/import/handlers";
import { normalizeRead } from "@/lib/import/normalize";
import { aiReadSchema, confirmImportBodySchema } from "@/lib/import/schema";
import { handleDecidePoint, handlePointInbox, handleRebuildPoints, type PointDeps, type PointStore } from "@/lib/points/handlers";
import { decidePointBodySchema } from "@/lib/points/schemas";
import { parsePointInbox } from "@/lib/points/shape";
import { groupPointInbox } from "@/lib/points/view";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const DEC = "d0000000-0000-4000-8000-000000000001";
const BATCH = "c0000000-0000-4000-8000-0000000000c1";
const FILE_A = "e0000000-0000-4000-8000-0000000000f1";
const FILE_B = "e0000000-0000-4000-8000-0000000000f2";
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
const accessDeps = { store: access, allowRealLearners: false, now: new Date("2026-11-08T08:00:00Z") };

// ---- points ------------------------------------------------------------------------------------------------------------------------
const INBOX = {
  open: 1, decidable: 1,
  items: [{
    id: DEC, kind: "PROPOSED", learner_id: NGUYEN, alias: "Nguyên", is_test: true, tag_key: "cum-dong-tu", title_vi: "Cụm động từ", from_state: "DEVELOPING", to_state: "INDEPENDENT",
    current_state: "DEVELOPING", conditions: [{ id: "l3_counted", level: 3, have: 5, need: 4, met: true }],
    evidence: [{ ref: "B-IM-000001:q50:att1", item: "q50", title_vi: "Progress Test", at: "2026-10-23" }], created_at: "2026-11-08T10:00:00+07:00", can_decide: true,
  }],
};
const pointStore = (over: Partial<PointStore> = {}) =>
  ({
    getDecisionLearnerId: vi.fn(async (id: string) => (id === DEC ? NGUYEN : null)),
    getDecisionTag: vi.fn(async () => "cum-dong-tu"),
    map: vi.fn(async (): Promise<unknown> => ({ learner_id: NGUYEN, policy_version: "PP-0.1", points: [] })),
    inbox: vi.fn(async (): Promise<unknown> => INBOX),
    decide: vi.fn(async (): Promise<unknown> => ({ id: "c1", tag_key: "cum-dong-tu", replayed: false })),
    ...over,
  }) satisfies PointStore;
const pointEngine = (): PointEngineStore => ({
  loadInputs: vi.fn(async (): Promise<unknown> => ({ learner_id: NGUYEN, now: "2026-11-08T10:00:00+07:00", policy: null, points: [] })),
  applyResults: vi.fn(async (): Promise<unknown> => ({ auto: 0, proposed: 0, flagged: 0, policy_version: "PP-0.1" })),
  resetStates: vi.fn(async (): Promise<unknown> => ({})),
});
const pdeps = (user: string | null, store: PointStore = pointStore(), engine: PointEngineStore = pointEngine()): PointDeps => ({
  user: user ? { id: `u-${user}` } : null, store, engine, access: accessDeps, log: vi.fn(async () => {}),
});
const confirm = { client_id: "point-0001", action: "confirm" };

describe("point decisions", () => {
  it("body: confirm needs nothing more, 'Chưa' needs a reason of 3+ characters", () => {
    expect(decidePointBodySchema.safeParse(confirm).success).toBe(true);
    expect(decidePointBodySchema.safeParse({ client_id: "point-0002", action: "reject", reason: "ab" }).success).toBe(false);
    expect(decidePointBodySchema.safeParse({ client_id: "point-0002", action: "reject", reason: "Chưa đủ ngày" }).success).toBe(true);
  });
  it("the child's tutor confirms (201, rpc args, point recomputed); the parent gets 403; another child's tutor 404; a student 403; anonymous 401", async () => {
    const s = pointStore();
    const e = pointEngine();
    const r = await handleDecidePoint(pdeps("tutorNguyen", s, e), DEC, confirm);
    expect(r).toEqual({ status: 201, body: { id: "c1", replayed: false } });
    expect(s.decide).toHaveBeenCalledWith({ decisionId: DEC, action: "confirm", reason: null, byMemberId: "m-tutorNguyen", clientId: "point-0001", evidenceKey: null });
    expect(e.loadInputs).toHaveBeenCalledWith(NGUYEN, ["cum-dong-tu"]);
    expect((await handleDecidePoint(pdeps("parent"), DEC, confirm)).status).toBe(403);
    expect((await handleDecidePoint(pdeps("tutorAn"), DEC, confirm)).status).toBe(404);
    expect((await handleDecidePoint(pdeps("studentNguyen"), DEC, confirm)).status).toBe(403);
    expect((await handleDecidePoint(pdeps(null), DEC, confirm)).status).toBe(401);
    expect((await handleDecidePoint(pdeps("tutorNguyen"), "not-a-uuid", confirm)).status).toBe(404);
  });
  it("'Chưa' without a reason is 400; a replay is 200 and recomputes nothing; an engine error never fails the decision", async () => {
    expect((await handleDecidePoint(pdeps("tutorNguyen"), DEC, { client_id: "point-0003", action: "reject" })).body).toMatchObject({ error: "skill_reason_required" });
    const e = pointEngine();
    const replay = pointStore({ decide: vi.fn(async () => ({ id: "c1", tag_key: "cum-dong-tu", replayed: true })) });
    expect((await handleDecidePoint(pdeps("tutorNguyen", replay, e), DEC, confirm)).status).toBe(200);
    expect(e.loadInputs).not.toHaveBeenCalled();
    const broken: PointEngineStore = { ...pointEngine(), loadInputs: vi.fn(async () => Promise.reject(new Error("boom"))) };
    const d = pdeps("tutorNguyen", pointStore(), broken);
    expect((await handleDecidePoint(d, DEC, confirm)).status).toBe(201);
    expect(d.log).toHaveBeenCalled();
  });
  it("'Hạ mức' (lower) needs a reason, is for the child's tutor only, and passes the evidence key the tutor is looking at", async () => {
    expect((await handleDecidePoint(pdeps("tutorNguyen"), DEC, { client_id: "point-0009", action: "lower" })).body).toMatchObject({ error: "skill_reason_required" });
    expect((await handleDecidePoint(pdeps("parent"), DEC, { client_id: "point-0009", action: "lower", reason: "sai lại hai lần" })).status).toBe(403);
    const store = pointStore();
    const r = await handleDecidePoint(pdeps("tutorNguyen", store), DEC, { client_id: "point-0009", action: "lower", reason: "sai lại hai lần" });
    expect(r.status).toBe(201);
    expect(store.decide).toHaveBeenCalledWith(expect.objectContaining({ action: "lower", reason: "sai lại hai lần" }));
  });
  it("database tags become friendly answers", async () => {
    const err = (code: string, tag: string) => pointStore({ decide: vi.fn(async () => Promise.reject(new ReviewDbError(code, `eng_decide_point: x (${tag})`))) });
    expect((await handleDecidePoint(pdeps("tutorNguyen", err("23505", "already_answered")), DEC, confirm)).body).toMatchObject({ error: "already_answered" });
    expect((await handleDecidePoint(pdeps("tutorNguyen", err("23514", "stale_proposal")), DEC, confirm)).status).toBe(409);
    expect((await handleDecidePoint(pdeps("tutorNguyen", err("42501", "tutor_only")), DEC, confirm)).status).toBe(403);
  });
  it("inbox: staff only, parsed to camelCase and grouped by child; rebuild is for the tutor and the parent", async () => {
    const r = await handlePointInbox(pdeps("parent"));
    const inbox = (r.body as { inbox: ReturnType<typeof parsePointInbox> }).inbox;
    expect(inbox.items[0]).toMatchObject({ tagKey: "cum-dong-tu", toState: "INDEPENDENT", canDecide: true });
    expect(groupPointInbox(inbox.items).map((g) => [g.alias, g.items.length])).toEqual([["Nguyên", 1]]);
    expect((await handlePointInbox(pdeps("studentNguyen"))).status).toBe(403);
    expect((await handleRebuildPoints(pdeps("parent"), NGUYEN)).status).toBe(200);
    expect((await handleRebuildPoints(pdeps("tutorNguyen"), NGUYEN)).status).toBe(200);
    expect((await handleRebuildPoints(pdeps("studentNguyen"), NGUYEN)).status).toBe(403);
  });
});

// ---- import ------------------------------------------------------------------------------------------------------------------------
const CTX: ReadContext = {
  tags: ["bi-dong-nho-tuong-thuat", "cau-dieu-kien-dao-ngu", "wish-would-rather", "modal-suy-doan", "dang-tu", "tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "doc-main-idea"].map((key) => ({
    key, label: key, domain: null, group: null, custom: false, reading: key === "doc-main-idea",
  })),
};
const FAKE = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/import/fake-read-answers.json"), "utf8")) as unknown;
const DRAFT = normalizeRead(aiReadSchema.parse(FAKE), CTX);
const GATE_ON = { family_id: FAMILY, enabled: true, consent: true, spent_usd: 1.5, monthly_cap_usd: 10, soft_cap_usd: 8, soft_reached: false, allowed: true, reason: null };
const batchRow = (over: Record<string, unknown> = {}) => ({
  id: BATCH, learner_id: NGUYEN, track_id: "B", title: "Progress Test 1-12", taken_on: "2026-10-23", support_level: "tu_lam_chua", status: "draft", payload: DRAFT, error_code: null,
  work_file_id: FILE_A, key_file_id: FILE_B, allow_other: false, template_id: null, attempt_id: null, updated_at: "2026-11-08 03:00:00.123456+00", created_at: "2026-11-08T03:00:00Z", ...over,
});
const importStore = (over: Partial<ImportStore> = {}): ImportStore => ({
  getImportLearnerId: vi.fn(async (id: string) => (id === BATCH ? NGUYEN : null)),
  issueUploadTicket: vi.fn(async () => ({ issued: 1 })),
  aiGate: vi.fn(async () => GATE_ON),
  aiReserve: vi.fn(async () => ({ ...GATE_ON, reservation_id: "res-1" })),
  logAiRun: vi.fn(async () => "run-1"),
  create: vi.fn(async () => ({ id: BATCH, status: "reading", replayed: false })),
  batch: vi.fn(async () => batchRow()),
  finish: vi.fn(async () => ({ applied: true })),
  fail: vi.fn(async () => ({ applied: true })),
  discard: vi.fn(async () => ({ id: BATCH, status: "discarded" })),
  confirm: vi.fn(async () => ({ template_id: "B-IM-000001", attempt_id: "att-1", counted: 51, tags: ["cum-dong-tu"], replayed: false })),
  ...over,
});
function ideps(user: string | null, s: ImportStore = importStore()): ImportDeps & { jobs: (() => Promise<void>)[]; points: ReturnType<typeof vi.fn>; skills: ReturnType<typeof vi.fn> } {
  const jobs: (() => Promise<void>)[] = [];
  const points = vi.fn(async () => undefined);
  const skills = vi.fn(async () => undefined);
  return {
    jobs, points, skills,
    user: user ? { id: `u-${user}` } : null,
    store: s,
    storage: {
      createUpload: vi.fn(async (p: string) => ({ url: `https://upload/${p}` })),
      stat: vi.fn(async (p: string) => ({ bytes: 2048, mime: p.endsWith(".png") ? "image/png" : "application/pdf" })),
      createDownload: vi.fn(async () => "https://dl"),
      removeFolder: vi.fn(async () => 0),
      download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
    access: accessDeps,
    schedule: (job) => jobs.push(job),
    loadContext: async () => CTX,
    getAi: () => ({ call: async () => ({ input: FAKE, usage: { inputTokens: 900, outputTokens: 2400 }, model: "claude-sonnet-5-5" }), model: "claude-sonnet-5-5", toolChoice: "tool", prompt: { text: "{{TAGS}}", version: "read-answers.v1" } }),
    docxToText: async () => "key",
    afterPoints: points,
    afterSkills: skills,
    newId: () => FILE_A,
    log: vi.fn(async () => {}),
  };
}
const png = { id: FILE_A, mime: "image/png", bytes: 2048 };
const pdf = { id: FILE_B, mime: "application/pdf", bytes: 2048 };
const create = (who: string, s = importStore(), body: Record<string, unknown> = {}) =>
  handleCreateImport(ideps(who, s), NGUYEN, {
    title: "Progress Test 1-12", work_file: png, key_file: pdf, taken_on: "2026-10-23", support_level: "tu_lam_chua", source_hash: "a".repeat(64), client_id: "import-00001", ...body,
  });
const rows = DRAFT.items.map((i) => ({
  n: i.n, part: i.part, student_answer: i.student_answer, key_answer: i.key_answer, tag: i.tag ?? "cum-dong-tu", out_of_app: i.out_of_app,
  result: i.result === "needs_person" ? ("incorrect" as const) : i.result,
}));
const goodBody = { base_updated_at: "2026-11-08 03:00:00.123456+00", rows, client_id: "confirm-0001" };

describe("import — access and files", () => {
  it("student, anonymous and the other child's tutor get nothing; the work may be a photo, the key may be Word", async () => {
    expect((await handleImportUploadUrl(ideps("studentNguyen"), NGUYEN, { purpose: "import_work", mime: "image/png", bytes: 10 })).status).toBe(403);
    expect((await handleImportUploadUrl(ideps(null), NGUYEN, { purpose: "import_work", mime: "image/png", bytes: 10 })).status).toBe(401);
    expect((await handleImportUploadUrl(ideps("tutorAn"), NGUYEN, { purpose: "import_work", mime: "image/png", bytes: 10 })).status).toBe(404);
    expect((await handleImportUploadUrl(ideps("parent"), NGUYEN, { purpose: "import_work", mime: "image/png", bytes: 10 })).status).toBe(201);
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect((await handleImportUploadUrl(ideps("tutorNguyen"), NGUYEN, { purpose: "import_key", mime: docx, bytes: 10 })).status).toBe(201);
    expect((await handleImportUploadUrl(ideps("tutorNguyen"), NGUYEN, { purpose: "import_work", mime: docx, bytes: 10 })).body).toMatchObject({ error: "file_type" });
  });
});

describe("import — create and the AI read", () => {
  it("tutor or parent starts it; the job reserves, logs one ok run and saves a 60-row draft", async () => {
    const s = importStore();
    const d = ideps("parent", s);
    const r = await handleCreateImport(d, NGUYEN, {
      title: "Progress Test 1-12", work_file: png, key_file: pdf, taken_on: "2026-10-23", support_level: "tu_lam_chua", source_hash: "a".repeat(64), client_id: "import-00001",
    });
    expect(r).toMatchObject({ status: 201, body: { import_id: BATCH, status: "reading" } });
    expect(d.jobs).toHaveLength(1);
    await d.jobs[0]!();
    expect(s.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", promptVersion: "read-answers.v1", draftId: BATCH, releasesRunId: "res-1" }));
    const saved = (s.finish as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { payload: { items: unknown[] } };
    expect(saved.payload.items).toHaveLength(60);
  });
  it("a student is refused; AI off → 409 and nothing is created; a duplicate → 409; a future date → 400", async () => {
    expect((await create("studentNguyen")).status).toBe(403);
    const off = importStore({ aiGate: vi.fn(async () => ({ ...GATE_ON, enabled: false, allowed: false, reason: "off" })) });
    expect((await create("tutorNguyen", off)).body).toMatchObject({ error: "ai_off" });
    expect(off.create).not.toHaveBeenCalled();
    expect(off.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_off" }));
    const dup = importStore({ create: vi.fn(async () => Promise.reject(new ReviewDbError("23505", "eng_create_import: x (duplicate_import)"))) });
    expect(await create("tutorNguyen", dup)).toMatchObject({ status: 409, body: { error: "duplicate_import" } });
    const future = importStore({ create: vi.fn(async () => Promise.reject(new ReviewDbError("23514", "eng_create_import: x (date_future)"))) });
    expect(await create("tutorNguyen", future)).toMatchObject({ status: 400, body: { error: "date_future" } });
  });
  it("a bad body or a file that is not in storage is 400 before any AI call", async () => {
    expect((await create("tutorNguyen", importStore(), { source_hash: "xyz" })).body).toMatchObject({ error: "invalid_body" });
    const d = ideps("tutorNguyen");
    (d.storage.stat as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await handleCreateImport(d, NGUYEN, { title: "T", work_file: png, key_file: pdf, taken_on: "2026-10-23", support_level: "tu_lam", source_hash: "b".repeat(64), client_id: "import-00002" });
    expect(r.body).toMatchObject({ error: "file_missing" });
  });
  it("a read that stays 'reading' too long is marked failed when it is opened", async () => {
    const s = importStore({ batch: vi.fn().mockResolvedValueOnce(batchRow({ status: "reading", payload: { items: [] }, created_at: "2026-11-08T02:00:00Z" })).mockResolvedValue(batchRow({ status: "ai_failed", payload: { items: [] }, error_code: "timeout" })) });
    const r = await handleGetImport(ideps("tutorNguyen", s), BATCH, { view: "status" });
    expect(s.fail).toHaveBeenCalledWith({ batchId: BATCH, errorCode: "timeout", runId: null });
    expect(r.body).toEqual({ status: "ai_failed", error_code: "timeout" });
  });
});

describe("import — confirm (the child's tutor only)", () => {
  it("builds the p_build from the reviewed rows; recomputes points and skills afterwards", async () => {
    const s = importStore();
    const d = ideps("tutorNguyen", s);
    const r = await handleConfirmImport(d, BATCH, goodBody);
    expect(r).toMatchObject({ status: 201, body: { template_id: "B-IM-000001", counted: 51, replayed: false } });
    const arg = (s.confirm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { base: string; build: { template: { items: unknown[] }; meta: { n: number; tag_key: string | null; reading_skill_key: string | null }[]; results: unknown[] } };
    expect(arg.build.template.items).toHaveLength(60);
    expect(arg.build.results).toHaveLength(60);
    expect(arg.build.meta.every((m) => (m.tag_key === null) !== (m.reading_skill_key === null))).toBe(true);
    expect(d.points).toHaveBeenCalledWith(NGUYEN, ["cum-dong-tu"]);
    expect(d.skills).toHaveBeenCalledWith(NGUYEN, null);
  });
  it("a parent is refused (tutor_only); a stale base is 409; a draft that is not 'draft' is 400; unresolved or unknown rows are 400", async () => {
    expect((await handleConfirmImport(ideps("parent"), BATCH, goodBody)).body).toMatchObject({ error: "tutor_only" });
    expect((await handleConfirmImport(ideps("tutorNguyen"), BATCH, { ...goodBody, base_updated_at: "2026-11-08 03:00:01+00" })).status).toBe(409);
    expect((await handleConfirmImport(ideps("tutorNguyen", importStore({ batch: vi.fn(async () => batchRow({ status: "reading", payload: { items: [] } })) })), BATCH, goodBody)).body).toMatchObject({ error: "not_draft" });
    expect(confirmImportBodySchema.safeParse({ ...goodBody, rows: [{ ...rows[0], result: "needs_person" }] }).success).toBe(false);
    expect(confirmImportBodySchema.safeParse({ ...goodBody, rows: [{ ...rows[0], tag: "" }] }).success).toBe(false);
    expect((await handleConfirmImport(ideps("tutorNguyen"), BATCH, { ...goodBody, rows: [{ ...rows[0], tag: "khong-co" }] })).body).toMatchObject({ error: "unknown_tag" });
  });
  it("an already confirmed import answers 200 without writing again; database tags map to answers", async () => {
    const done = importStore({ batch: vi.fn(async () => batchRow({ status: "confirmed", template_id: "B-IM-000001" })) });
    expect(await handleConfirmImport(ideps("tutorNguyen", done), BATCH, goodBody)).toMatchObject({ status: 200, body: { replayed: true } });
    expect(done.confirm).not.toHaveBeenCalled();
    const bad = importStore({ confirm: vi.fn(async () => Promise.reject(new ReviewDbError("22023", "eng_confirm_import: x (bad_tag)"))) });
    expect((await handleConfirmImport(ideps("tutorNguyen", bad), BATCH, goodBody)).body).toMatchObject({ error: "bad_tag" });
  });
});

describe("buildImport", () => {
  it("only app questions become items; paper-only rows stay in the meta; a reading skill goes to reading_skill_key", () => {
    const r = buildImport(
      [
        { n: 2, part: "A", student_answer: "B", key_answer: "B | C", tag: "doc-main-idea", out_of_app: false, result: "correct" },
        { n: 1, part: "", student_answer: null, key_answer: null, tag: "cum-dong-tu", out_of_app: true, result: "blank" },
      ],
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.build.template.items.map((i) => i.id)).toEqual(["q2"]);
    expect(r.build.keys).toEqual([{ item_id: "q2", kind: "answer", answer: "B", explanation_vi: null }]);
    expect(r.build.meta).toEqual([
      { n: 1, part: "-", tag_key: "cum-dong-tu", reading_skill_key: null, out_of_app: true },
      { n: 2, part: "A", tag_key: null, reading_skill_key: "doc-main-idea", out_of_app: false },
    ]);
    expect(buildImport([{ n: 1, part: "A", student_answer: null, key_answer: null, tag: "cum-dong-tu", out_of_app: true, result: "blank" }], CTX)).toEqual({ ok: false, error: "no_app_rows" });
    expect(buildImport([{ n: 1, part: "A", student_answer: null, key_answer: null, tag: "x", out_of_app: false, result: "blank" }], CTX)).toEqual({ ok: false, error: "unknown_tag" });
  });
});
