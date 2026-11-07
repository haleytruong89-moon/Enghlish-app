import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { handleSendAppFeedback, handleUpdateAppFeedback, handleWriteIntake, handleWriteTeachingNote, type WorkdeskDeps, type WorkdeskStore } from "@/lib/workdesk/handlers";
import { appFeedbackBodySchema, feedbackUpdateBodySchema, intakeBodySchema, teachingNoteBodySchema } from "@/lib/workdesk/schemas";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const FB = "c0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-08T08:00:00Z");
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
const store = (over: Partial<WorkdeskStore> = {}) =>
  ({
    writeNote: vi.fn(async (): Promise<unknown> => ({ id: "n1", replayed: false })),
    writeIntake: vi.fn(async (): Promise<unknown> => ({ id: "i1", replayed: false })),
    sendFeedback: vi.fn(async (): Promise<unknown> => ({ id: "f1", replayed: false })),
    updateFeedback: vi.fn(async (): Promise<unknown> => ({ id: "e1", replayed: false })),
    ...over,
  }) satisfies WorkdeskStore;
const deps = (user: string | null, s: WorkdeskStore): WorkdeskDeps => ({ user: user ? { id: `u-${user}` } : null, store: s, access: { store: access, allowRealLearners: false, now: NOW } });
const note = { field: "focus", text: "Đảo ngữ", client_id: "tn-00000001" };
const intake = { goals: [{ title: "Thi vào 10", due: "2027-06" }], strengths: { vocab: "Từ vựng khá", grammar: "" }, weaknesses: { listening: "Nghe yếu" }, note: "", client_id: "in-00000001" };
const fb = { kind: "hard_to_use", screen: "Ghi buổi học", text: "Chọn kỹ năng phải cuộn lâu", client_id: "fb-00000001" };
const upd = { status: "in_progress", reply: " Bản sau sẽ sửa ", client_id: "fu-00000001" };

describe("request bodies", () => {
  it("teaching note: one of 4 fields, up to 600 chars (empty clears), no extra keys", () => {
    expect(teachingNoteBodySchema.safeParse(note).success).toBe(true);
    expect(teachingNoteBodySchema.safeParse({ ...note, text: "" }).success).toBe(true);
    expect(teachingNoteBodySchema.safeParse({ ...note, field: "mood" }).success).toBe(false);
    expect(teachingNoteBodySchema.safeParse({ ...note, text: "x".repeat(601) }).success).toBe(false);
    expect(teachingNoteBodySchema.safeParse({ ...note, author: "x" }).success).toBe(false);
  });
  it("intake: known domains only; goals need a title", () => {
    expect(intakeBodySchema.safeParse(intake).success).toBe(true);
    expect(intakeBodySchema.safeParse({ ...intake, strengths: { music: "x" } }).success).toBe(false);
    expect(intakeBodySchema.safeParse({ ...intake, goals: [{ title: " ", due: null }] }).success).toBe(false);
  });
  it("feedback: known kind, text 1..1000, screen 1..80; update: known status", () => {
    expect(appFeedbackBodySchema.safeParse(fb).success).toBe(true);
    expect(appFeedbackBodySchema.safeParse({ ...fb, kind: "praise" }).success).toBe(false);
    expect(appFeedbackBodySchema.safeParse({ ...fb, text: "  " }).success).toBe(false);
    expect(feedbackUpdateBodySchema.safeParse(upd).success).toBe(true);
    expect(feedbackUpdateBodySchema.safeParse({ ...upd, status: "fixed" }).success).toBe(false);
  });
});

describe("handleWriteTeachingNote", () => {
  it("tutor of the child → 201 and rpc args; replay 200; parent → 403; other tutor → 404; student 403; bad field → 400", async () => {
    const s = store();
    expect(await handleWriteTeachingNote(deps("tutorNguyen", s), NGUYEN, note)).toEqual({ status: 201, body: { id: "n1", replayed: false } });
    expect(s.writeNote).toHaveBeenCalledWith({ learnerId: NGUYEN, field: "focus", text: "Đảo ngữ", byMemberId: "m-tutorNguyen", clientId: "tn-00000001" });
    const again = store({ writeNote: vi.fn(async (): Promise<unknown> => ({ id: "n1", replayed: true })) });
    expect((await handleWriteTeachingNote(deps("tutorNguyen", again), NGUYEN, note)).status).toBe(200);
    expect((await handleWriteTeachingNote(deps(null, s), NGUYEN, note)).status).toBe(401);
    expect((await handleWriteTeachingNote(deps("parent", s), NGUYEN, note)).status).toBe(403);
    expect((await handleWriteTeachingNote(deps("tutorAn", s), NGUYEN, note)).status).toBe(404);
    expect((await handleWriteTeachingNote(deps("studentNguyen", s), NGUYEN, note)).status).toBe(403);
    expect((await handleWriteTeachingNote(deps("tutorNguyen", s), NGUYEN, { ...note, field: "mood" })).status).toBe(400);
    expect(s.writeNote).toHaveBeenCalledTimes(1);
  });
  it("maps database answers", async () => {
    const throwing = (code: string, detail: string) => store({ writeNote: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
    expect(await handleWriteTeachingNote(deps("tutorNguyen", throwing("42501", "x (tutor_only)")), NGUYEN, note)).toMatchObject({ status: 403, body: { error: "teaching_tutor_only" } });
    expect(await handleWriteTeachingNote(deps("tutorNguyen", throwing("22023", "x (too_long)")), NGUYEN, note)).toMatchObject({ status: 400, body: { error: "too_long" } });
  });
});

describe("handleWriteIntake", () => {
  it("tutor writes; empty domain entries are dropped; parent 403", async () => {
    const s = store();
    expect((await handleWriteIntake(deps("tutorNguyen", s), NGUYEN, intake)).status).toBe(201);
    expect(s.writeIntake).toHaveBeenCalledWith({
      learnerId: NGUYEN, byMemberId: "m-tutorNguyen", clientId: "in-00000001",
      content: { goals: intake.goals, strengths: { vocab: "Từ vựng khá" }, weaknesses: { listening: "Nghe yếu" }, note: "" },
    });
    expect((await handleWriteIntake(deps("parent", s), NGUYEN, intake)).status).toBe(403);
  });
});

describe("handleSendAppFeedback / handleUpdateAppFeedback", () => {
  it("tutor and parent send (201); student 403; no session 401; bad body 400", async () => {
    const s = store();
    expect((await handleSendAppFeedback(deps("tutorAn", s), fb)).status).toBe(201);
    expect((await handleSendAppFeedback(deps("parent", s), fb)).status).toBe(201);
    expect(s.sendFeedback).toHaveBeenCalledWith({ kind: "hard_to_use", screen: "Ghi buổi học", text: "Chọn kỹ năng phải cuộn lâu", byMemberId: "m-tutorAn", clientId: "fb-00000001" });
    expect((await handleSendAppFeedback(deps("studentNguyen", s), fb)).status).toBe(403);
    expect((await handleSendAppFeedback(deps(null, s), fb)).status).toBe(401);
    expect((await handleSendAppFeedback(deps("parent", s), { ...fb, kind: "praise" })).status).toBe(400);
  });
  it("only the parent updates; the reply is trimmed", async () => {
    const s = store();
    expect((await handleUpdateAppFeedback(deps("parent", s), FB, upd)).status).toBe(201);
    expect(s.updateFeedback).toHaveBeenCalledWith({ feedbackId: FB, status: "in_progress", reply: "Bản sau sẽ sửa", byMemberId: "m-parent", clientId: "fu-00000001" });
    expect(await handleUpdateAppFeedback(deps("tutorAn", s), FB, upd)).toMatchObject({ status: 403, body: { error: "feedback_parent_only" } });
    expect((await handleUpdateAppFeedback(deps("studentNguyen", s), FB, upd)).status).toBe(403);
    expect(s.updateFeedback).toHaveBeenCalledTimes(1);
  });
  it("an unknown feedback id answers 404", async () => {
    const s = store({ updateFeedback: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError("P0002", "not found"); }) });
    expect((await handleUpdateAppFeedback(deps("parent", s), FB, upd)).status).toBe(404);
  });
});
