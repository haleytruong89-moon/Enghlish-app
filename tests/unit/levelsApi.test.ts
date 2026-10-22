import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { tutorWorkErrors } from "@/lib/copy/vi";
import { handleRecordExternalResult, handleRecordLevels, type LevelDeps, type LevelStore } from "@/lib/levels/handlers";
import { externalResultBodySchema, recordLevelsBodySchema } from "@/lib/levels/schemas";
import { staffUploadBodySchema } from "@/lib/practice/schemas";
import { ReviewDbError } from "@/lib/review/handlers";
import { checkFile, FILE_KINDS } from "@/lib/storage/rules";
import type { FileStorage } from "@/lib/storage/types";
import { failText } from "@/lib/tutorwork/client";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const FILE = "d0000000-0000-4000-8000-000000000009";
const NOW = new Date("2026-10-22T08:00:00Z");
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
const store = (over: Partial<LevelStore> = {}) =>
  ({
    recordLevels: vi.fn(async (): Promise<unknown> => ({ ids: ["d1"], replayed: false })),
    recordExternal: vi.fn(async (): Promise<unknown> => ({ id: "x1", replayed: false })),
    ...over,
  }) satisfies LevelStore;
const storage = (stat: { bytes: number; mime: string } | null = { bytes: 2048, mime: "application/pdf" }) =>
  ({
    createUpload: vi.fn(async () => ({ url: "https://signed.example/u" })),
    stat: vi.fn(async () => stat),
    createDownload: vi.fn(async () => "https://signed.example/d"),
    removeFolder: vi.fn(async () => 0),
  }) satisfies FileStorage;
const deps = (user: string | null, s: LevelStore, st: FileStorage = storage()): LevelDeps => ({
  user: user ? { id: `u-${user}` } : null, store: s, storage: st, access: { store: access, allowRealLearners: false, now: NOW },
});
const baseline = { client_id: "levels-0001", kind: "baseline", levels: { grammar: "B2+", thinking: "3" }, reason: "Buổi đầu" };
const adjust = { client_id: "levels-0002", kind: "adjust", levels: { writing: "B1+" }, reason: "Bài luận còn thiếu liên kết" };
const result = { client_id: "external-0001", exam: "FCE", taken_on: "2026-09-12", score_text: "172 · Grade B", domains: ["reading", "listening"] };

describe("request bodies", () => {
  it("levels: a baseline names 1..7 domains; an adjustment exactly one with a reason; unknown fields, domains, levels and kinds are refused", () => {
    expect(recordLevelsBodySchema.safeParse(baseline).success).toBe(true);
    expect(recordLevelsBodySchema.safeParse(adjust).success).toBe(true);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, reason: undefined }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, reason: "   " }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, levels: { writing: "B1+", vocab: "B2" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: {} }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: { music: "B1" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: { grammar: "D1" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, kind: "level_up" }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, evidence: {} }).success).toBe(false);
  });

  it("external result: a known exam, a calendar date, a score, 1..7 domains, an optional file {id, mime, bytes}", () => {
    expect(externalResultBodySchema.safeParse(result).success).toBe(true);
    expect(externalResultBodySchema.safeParse({ ...result, file: { id: FILE, mime: "image/jpeg", bytes: 10 } }).success).toBe(true);
    expect(externalResultBodySchema.safeParse({ ...result, exam: "IELTS" }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, taken_on: "2026-02-30" }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, score_text: " " }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, domains: [] }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, file: { id: FILE, mime: "text/html", bytes: 10 } }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, path: "x/y.pdf" }).success).toBe(false);
  });

  it("an exam sheet is uploaded with the staff purpose 'external_result'; the kind takes a PDF or an image", () => {
    expect(staffUploadBodySchema.safeParse({ purpose: "external_result", mime: "application/pdf", bytes: 10 }).success).toBe(true);
    expect(FILE_KINDS).toContain("external_result");
    expect([checkFile("external_result", "application/pdf", 10), checkFile("external_result", "image/png", 10)]).toEqual([{ ok: true }, { ok: true }]);
  });
});

describe("handleRecordLevels (the child's tutor only)", () => {
  it("the tutor records; the store gets the cleaned body and the tutor's member id; a replay answers 200", async () => {
    const s = store();
    expect(await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, baseline)).toEqual({ status: 201, body: { ids: ["d1"], replayed: false } });
    expect(s.recordLevels).toHaveBeenCalledWith({
      learnerId: NGUYEN, kind: "baseline", levels: { grammar: "B2+", thinking: "3" }, reason: "Buổi đầu", byMemberId: "m-tutorNguyen", clientId: "levels-0001",
    });
    const again = store({ recordLevels: vi.fn(async (): Promise<unknown> => ({ ids: ["d1"], replayed: true })) });
    expect((await handleRecordLevels(deps("tutorNguyen", again), NGUYEN, { ...baseline, reason: undefined })).status).toBe(200);
    expect(again.recordLevels).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it("access first: no session 401, the parent 403, another child's tutor 404, the student 403 - before the body is read", async () => {
    const s = store();
    expect((await handleRecordLevels(deps(null, s), NGUYEN, "x")).status).toBe(401);
    expect((await handleRecordLevels(deps("parent", s), NGUYEN, baseline)).status).toBe(403);
    expect((await handleRecordLevels(deps("tutorAn", s), NGUYEN, baseline)).status).toBe(404);
    expect((await handleRecordLevels(deps("studentNguyen", s), NGUYEN, baseline)).status).toBe(403);
    expect((await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, { ...baseline, kind: "level_up" })).status).toBe(400);
    expect(s.recordLevels).not.toHaveBeenCalled();
  });

  it("maps the database answers to codes the screens can explain", async () => {
    const cases: [string, string, number, string][] = [
      ["42501", "eng_record_level: only a tutor of this learner records levels (tutor_only)", 403, "level_tutor_only"],
      ["23505", "x (already_confirmed)", 409, "already_confirmed"],
      ["23514", "x (needs_baseline)", 400, "needs_baseline"],
      ["23514", "x (same_level)", 400, "same_level"],
      ["23514", "x (reason_required)", 400, "reason_required"],
      ["22023", "x (bad_level)", 400, "invalid"],
      ["23505", "x client id was already used", 409, "conflict"],
    ];
    for (const [code, detail, status, error] of cases) {
      const s = store({ recordLevels: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, baseline), detail).toMatchObject({ status, body: { error } });
    }
  });
});

describe("handleRecordExternalResult (tutor or parent)", () => {
  it("the parent and the tutor record; without a file storage is never asked", async () => {
    const s = store();
    const st = storage();
    expect(await handleRecordExternalResult(deps("parent", s, st), NGUYEN, result)).toEqual({ status: 201, body: { id: "x1", replayed: false } });
    expect(s.recordExternal).toHaveBeenCalledWith({
      learnerId: NGUYEN, exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B", domains: ["reading", "listening"], note: null, file: null,
      byMemberId: "m-parent", clientId: "external-0001", supersedesId: null,
    });
    expect(st.stat).not.toHaveBeenCalled();
    expect((await handleRecordExternalResult(deps("tutorNguyen", store()), NGUYEN, result)).status).toBe(201);
  });

  it("a file must really be in storage at the path built from ids, with the claimed type and size", async () => {
    const file = { id: FILE, mime: "application/pdf", bytes: 2048 };
    const s = store();
    const st = storage();
    expect((await handleRecordExternalResult(deps("parent", s, st), NGUYEN, { ...result, file })).status).toBe(201);
    expect(st.stat).toHaveBeenCalledWith(`${FAMILY}/${NGUYEN}/${FILE}.pdf`);
    expect(s.recordExternal).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(await handleRecordExternalResult(deps("parent", store(), storage(null)), NGUYEN, { ...result, file })).toMatchObject({ status: 400, body: { error: "file_missing" } });
    expect(await handleRecordExternalResult(deps("parent", store(), storage({ bytes: 1, mime: "application/pdf" })), NGUYEN, { ...result, file }))
      .toMatchObject({ status: 400, body: { error: "file_mismatch" } });
  });

  it("a correction names the entry it replaces (A2): passed on to the store; already corrected is 409, unknown is 404", async () => {
    const OLD = "e0000000-0000-4000-8000-000000000005";
    const s = store();
    expect((await handleRecordExternalResult(deps("parent", s), NGUYEN, { ...result, supersedes_id: OLD })).status).toBe(201);
    expect(s.recordExternal).toHaveBeenCalledWith(expect.objectContaining({ supersedesId: OLD }));
    expect(externalResultBodySchema.safeParse({ ...result, supersedes_id: "not-an-id" }).success).toBe(false);
    const twice = store({ recordExternal: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError("23505", "x (already_superseded)"); }) });
    expect(await handleRecordExternalResult(deps("parent", twice), NGUYEN, { ...result, supersedes_id: OLD })).toMatchObject({ status: 409, body: { error: "already_superseded" } });
    const gone = store({ recordExternal: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError("P0002", "x (not_found)"); }) });
    expect(await handleRecordExternalResult(deps("parent", gone), NGUYEN, { ...result, supersedes_id: OLD })).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(failText({ ok: false, status: 409, error: "already_superseded" })).toBe(tutorWorkErrors.alreadySuperseded);
  });

  it("access first (401 / 404 / 403 for the student); a bad date is explained", async () => {
    const s = store();
    expect((await handleRecordExternalResult(deps(null, s), NGUYEN, result)).status).toBe(401);
    expect((await handleRecordExternalResult(deps("tutorAn", s), NGUYEN, result)).status).toBe(404);
    expect((await handleRecordExternalResult(deps("studentNguyen", s), NGUYEN, result)).status).toBe(403);
    expect(s.recordExternal).not.toHaveBeenCalled();
    const bad = store({ recordExternal: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError("23514", "x (bad_date)"); }) });
    expect(await handleRecordExternalResult(deps("parent", bad), NGUYEN, result)).toMatchObject({ status: 400, body: { error: "bad_date" } });
  });
});

describe("failText", () => {
  it("has one sentence for each new code", () => {
    const t = (status: number, error: string) => failText({ ok: false, status, error });
    expect([t(403, "level_tutor_only"), t(409, "already_confirmed"), t(400, "needs_baseline"), t(400, "same_level"), t(400, "reason_required"), t(400, "bad_date")]).toEqual([
      tutorWorkErrors.levelTutorOnly, tutorWorkErrors.alreadyConfirmed, tutorWorkErrors.needsBaseline, tutorWorkErrors.sameLevel,
      tutorWorkErrors.reasonRequired, tutorWorkErrors.badDate,
    ]);
  });
});
