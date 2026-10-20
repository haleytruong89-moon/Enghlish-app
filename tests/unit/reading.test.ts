import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import { handleRecordReadingReport, type ReadingDeps, type ReadingStore } from "@/lib/reading/handlers";
import { readingReportBodySchema } from "@/lib/reading/schemas";
import { parseReadingSkills } from "@/lib/reading/shape";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-20T08:00:00Z");
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
const store = (over: Partial<ReadingStore> = {}) => ({ recordReport: vi.fn(async () => ({ id: "rr1", replayed: false })), ...over }) satisfies ReadingStore;
const deps = (user: string | null, s: ReadingStore): ReadingDeps => ({ user: user ? { id: `u-${user}` } : null, store: s, access: { store: access, allowRealLearners: false, now: NOW } });
const good = { client_id: "reading-0001", month: "2026-10-01", rows: [{ tag_key: "doc-cause-effect", questions: 5, correct_pct: 40 }] };

describe("reading report body", () => {
  it("accepts a good body and refuses mid-month dates, empty or too many rows, bad numbers and unknown fields", () => {
    expect(readingReportBodySchema.safeParse(good).success).toBe(true);
    expect(readingReportBodySchema.safeParse({ ...good, month: "2026-10-15" }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: Array.from({ length: 21 }, (_, i) => ({ tag_key: `doc-x${i}`, questions: 1, correct_pct: 1 })) }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [{ tag_key: "doc-a", questions: 0, correct_pct: 1 }] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [{ tag_key: "doc-a", questions: 2, correct_pct: 100.5 }] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, lexile: 910 }).success).toBe(false);
  });
});

describe("handleRecordReadingReport", () => {
  it("tutor of the child and parent may record; the store gets the member id and the cleaned body", async () => {
    const s = store();
    expect(await handleRecordReadingReport(deps("tutorNguyen", s), NGUYEN, good)).toEqual({ status: 201, body: { id: "rr1", replayed: false } });
    expect(s.recordReport).toHaveBeenCalledWith({ learnerId: NGUYEN, month: "2026-10-01", source: null, rows: good.rows, note: null, supersedes: null, byMemberId: "m-tutorNguyen", clientId: "reading-0001" });
    expect((await handleRecordReadingReport(deps("parent", store()), NGUYEN, good)).status).toBe(201);
  });

  it("access comes first: no session 401, another child's tutor 404, the student himself 403 - before the body is read", async () => {
    const s = store();
    expect((await handleRecordReadingReport(deps(null, s), NGUYEN, "garbage")).status).toBe(401);
    expect((await handleRecordReadingReport(deps("tutorAn", s), NGUYEN, good)).status).toBe(404);
    expect((await handleRecordReadingReport(deps("studentNguyen", s), NGUYEN, good)).status).toBe(403);
    expect(s.recordReport).not.toHaveBeenCalled();
  });

  it("maps database answers: duplicate month 409, bad month 400, replay 200", async () => {
    const dup = store({ recordReport: vi.fn(async () => { throw new ReviewDbError("23505", "x: this month already has a report from this source (duplicate_month)"); }) });
    expect(await handleRecordReadingReport(deps("tutorNguyen", dup), NGUYEN, good)).toMatchObject({ status: 409, body: { error: "duplicate_month" } });
    const bad = store({ recordReport: vi.fn(async () => { throw new ReviewDbError("23514", "x: (bad_month)"); }) });
    expect(await handleRecordReadingReport(deps("tutorNguyen", bad), NGUYEN, good)).toMatchObject({ status: 400, body: { error: "bad_month" } });
    const replay = store({ recordReport: vi.fn(async () => ({ id: "rr1", replayed: true })) });
    expect((await handleRecordReadingReport(deps("tutorNguyen", replay), NGUYEN, good)).status).toBe(200);
  });
});

describe("parseReadingSkills", () => {
  it("maps snake_case to the view and keeps nulls", () => {
    const v = parseReadingSkills({
      min_questions: 4, weak_pct: 60, latest_month: "2026-10-01", latest_source: "TOMO", previous_month: null,
      skills: [{ tag_key: "doc-sequence", label_vi: "Chronology/Sequence — Trình tự", questions: 1, correct_pct: 0, prev_questions: null, prev_correct_pct: null, status: "thin", wrong_6w: 0 }],
    });
    expect(v).toEqual({
      minQuestions: 4, weakPct: 60, latestMonth: "2026-10-01", latestSource: "TOMO", previousMonth: null,
      skills: [{ tagKey: "doc-sequence", label: "Chronology/Sequence — Trình tự", questions: 1, correctPct: 0, prevQuestions: null, prevCorrectPct: null, status: "thin", wrong6w: 0 }],
    });
  });
});
