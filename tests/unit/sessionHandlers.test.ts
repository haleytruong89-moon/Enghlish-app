import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import { sessionError } from "@/lib/sessions/errors";
import { handleCancelAbsence, handleMarkSession, handleRecordAbsence, type SessionsDeps, type SessionsStore } from "@/lib/sessions/handlers";
import { absenceBodySchema, markBodySchema } from "@/lib/sessions/schemas";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const NOTE = "c0000000-0000-4000-8000-000000000001";
const NOTE_AN = "c0000000-0000-4000-8000-000000000002";
const ABS = "d0000000-0000-4000-8000-000000000001";
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
const store = (over: Partial<SessionsStore> = {}): SessionsStore => ({
  getNoteLearnerId: vi.fn(async (id: string) => (id === NOTE ? NGUYEN : id === NOTE_AN ? AN : null)),
  getAbsenceLearnerId: vi.fn(async (id: string) => (id === ABS ? NGUYEN : null)),
  recordAbsence: vi.fn(async () => ({ id: "x1", replayed: false })),
  cancelAbsence: vi.fn(async () => ({ id: "x2", replayed: false })),
  markSession: vi.fn(async () => ({ id: "x3", replayed: false })),
  ...over,
});
const deps = (user: string | null, s: SessionsStore): SessionsDeps => ({ user: user ? { id: user } : null, store: s, access: { store: access } });
const ABSENCE = { client_id: "client-0001", absent_on: "2026-11-19", requested_by: "student", billable: false };
const touched = (s: SessionsStore) => [s.recordAbsence, s.cancelAbsence, s.markSession, s.getNoteLearnerId, s.getAbsenceLearnerId].every((f) => vi.mocked(f).mock.calls.length === 0);

describe("session routes: access first", () => {
  it("no session = 401; a student = 403; another child's tutor = 404; nothing reaches the store", async () => {
    for (const [u, status] of [[null, 401], ["u-studentNguyen", 403], ["u-tutorAn", 404]] as const) {
      const s = store();
      expect((await handleRecordAbsence(deps(u, s), NGUYEN, ABSENCE)).status).toBe(status);
      expect((await handleCancelAbsence(deps(u, s), NGUYEN, ABS, { client_id: "client-0002", reason: "ghi nhầm" })).status).toBe(status);
      expect((await handleMarkSession(deps(u, s), NGUYEN, { client_id: "client-0003", note_id: NOTE, kind: "regular" })).status).toBe(status);
      expect(touched(s)).toBe(true);
    }
  });
  it("the child's tutor and the parent may write", async () => {
    for (const u of ["u-tutorNguyen", "u-parent"]) {
      const s = store();
      expect((await handleRecordAbsence(deps(u, s), NGUYEN, ABSENCE)).status).toBe(201);
    }
  });
  it("passes the signed-in member as the actor and the body fields as they are", async () => {
    const s = store();
    await handleRecordAbsence(deps("u-parent", s), NGUYEN, { ...ABSENCE, billable: true, note: "  ốm  " });
    expect(s.recordAbsence).toHaveBeenCalledWith({ learnerId: NGUYEN, absentOn: "2026-11-19", requestedBy: "student", billable: true, note: "ốm", byMemberId: "m-parent", clientId: "client-0001" });
  });
  it("a replay answers 200", async () => {
    const s = store({ recordAbsence: vi.fn(async () => ({ id: "x1", replayed: true })) });
    expect((await handleRecordAbsence(deps("u-tutorNguyen", s), NGUYEN, ABSENCE)).status).toBe(200);
  });
});

describe("session routes: bodies", () => {
  it("absence: ISO date, party enum, boolean billable, note <= 300, client_id 8..100, no extra keys", () => {
    expect(absenceBodySchema.safeParse(ABSENCE).success).toBe(true);
    for (const bad of [{ absent_on: "19/11/2026" }, { absent_on: "2026-02-31" }, { requested_by: "teacher" }, { billable: "yes" }, { note: "x".repeat(301) }, { client_id: "short" }, { client_id: "x".repeat(101) }, { amount: 5 }, { price: 1 }]) {
      expect(absenceBodySchema.safeParse({ ...ABSENCE, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("cancel: reason 5..300", async () => {
    const s = store();
    for (const reason of ["abc", "x".repeat(301), ""]) expect((await handleCancelAbsence(deps("u-tutorNguyen", s), NGUYEN, ABS, { client_id: "client-0002", reason })).status).toBe(400);
    expect(s.cancelAbsence).not.toHaveBeenCalled();
    expect((await handleCancelAbsence(deps("u-tutorNguyen", s), NGUYEN, ABS, { client_id: "client-0002", reason: "ghi nhầm ngày" })).status).toBe(201);
  });
  it("mark: not_counted needs a reason; makeup_for only with makeup; no counts accepted", () => {
    const ok = { client_id: "client-0003", note_id: NOTE };
    expect(markBodySchema.safeParse({ ...ok, kind: "not_counted" }).success).toBe(false);
    expect(markBodySchema.safeParse({ ...ok, kind: "not_counted", reason: "ghi nhầm em" }).success).toBe(true);
    expect(markBodySchema.safeParse({ ...ok, kind: "regular", makeup_for: ABS }).success).toBe(false);
    expect(markBodySchema.safeParse({ ...ok, kind: "makeup", makeup_for: ABS }).success).toBe(true);
    expect(markBodySchema.safeParse({ ...ok, kind: "weird" }).success).toBe(false);
    expect(markBodySchema.safeParse({ ...ok, kind: "regular", sessions: 9 }).success).toBe(false);
  });
});

describe("session routes: scope of ids and database answers", () => {
  it("a note or an absence of another child is a 404 (the path's child decides)", async () => {
    const s = store();
    expect((await handleMarkSession(deps("u-tutorNguyen", s), NGUYEN, { client_id: "client-0003", note_id: NOTE_AN, kind: "regular" })).status).toBe(404);
    expect((await handleCancelAbsence(deps("u-tutorNguyen", s), AN, ABS, { client_id: "client-0002", reason: "ghi nhầm" })).status).toBe(404);
    expect(s.markSession).not.toHaveBeenCalled();
    expect(s.cancelAbsence).not.toHaveBeenCalled();
    expect((await handleCancelAbsence(deps("u-tutorNguyen", s), NGUYEN, "not-a-uuid", { client_id: "client-0002", reason: "ghi nhầm" })).status).toBe(404);
  });
  it("SQL tags become short codes", () => {
    const e = (code: string, tag: string) => sessionError(new ReviewDbError(code, `eng_x: nope (${tag})`));
    expect(e("23514", "bad_date")).toMatchObject({ status: 400, body: { error: "bad_date" } });
    expect(e("23514", "reason_required")).toMatchObject({ status: 400, body: { error: "reason_required" } });
    expect(e("23505", "already_cancelled")).toMatchObject({ status: 409, body: { error: "already_cancelled" } });
    expect(e("23505", "client_id_reused")).toMatchObject({ status: 409, body: { error: "client_id_reused" } });
    expect(e("23514", "not_current")).toMatchObject({ status: 400, body: { error: "not_current" } });
    expect(e("22023", "kind_on_edit")).toMatchObject({ status: 400, body: { error: "kind_on_edit" } });
    expect(sessionError(new ReviewDbError("42501", "staff_only without a tag"))).toMatchObject({ status: 403 });
    expect(sessionError(new ReviewDbError("P0002", "not found"))).toMatchObject({ status: 404 });
  });
  it("before 0030 is applied: 409 sessions_unavailable, with words for it", async () => {
    const s = store({ recordAbsence: vi.fn(async () => { throw new ReviewDbError("sessions_unavailable", "missing"); }) });
    const r = await handleRecordAbsence(deps("u-tutorNguyen", s), NGUYEN, ABSENCE);
    expect(r).toMatchObject({ status: 409, body: { error: "sessions_unavailable" } });
    const { absenceCopy } = await import("@/lib/copy/vi");
    for (const tag of ["bad_date", "reason_required", "already_cancelled", "not_current", "sessions_unavailable", "client_id_reused", "bad_absence"]) expect(absenceCopy.errors[tag], tag).toBeTruthy();
  });
  it("an unknown database error is not swallowed (the route logs a 500)", async () => {
    const s = store({ recordAbsence: vi.fn(async () => { throw new Error("boom"); }) });
    await expect(handleRecordAbsence(deps("u-tutorNguyen", s), NGUYEN, ABSENCE)).rejects.toThrow("boom");
  });
});

describe("the route files", () => {
  it("every session route is no-store and goes through requireAccess (runSessionsRoute)", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("lib/sessions/route.ts", "utf8");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    for (const f of ["absences/route.ts", "absences/[absenceId]/cancel/route.ts", "marks/route.ts"]) {
      expect(readFileSync(`app/api/learners/[id]/sessions/${f}`, "utf8")).toContain("runSessionsRoute");
    }
  });
});
