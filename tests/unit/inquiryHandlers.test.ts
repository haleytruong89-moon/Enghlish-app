import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import {
  handleActivityEvent,
  handleAssign,
  handleListInquiries,
  handleListTemplates,
  InquiryDbError,
  type HandlerDeps,
  type InquiryStore,
} from "@/lib/inquiries/handlers";
import { assignBodySchema, eventBodySchema } from "@/lib/inquiries/schemas";
import { buildInquiryViews, buildTemplateViews, effectiveSchedule, type EventRow } from "@/lib/inquiries/view";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const ACT_AN = "11111111-1111-4111-8111-111111111111";
const ACT_NGUYEN = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-14T08:00:00Z");

const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("studentAn", "student"), mk("studentNguyen", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [{ memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null }];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};

function makeStore(over: Partial<InquiryStore> = {}) {
  const store = {
    listPublishedTemplates: vi.fn(async () => []),
    listInstances: vi.fn(async () => ({ instances: [], activities: [], events: [] })),
    assign: vi.fn(async () => "99999999-9999-4999-8999-999999999999"),
    getActivityLearnerId: vi.fn(async (id: string) => (id === ACT_AN ? AN : id === ACT_NGUYEN ? NGUYEN : null)),
    recordEvent: vi.fn(async () => 7),
    ...over,
  } satisfies InquiryStore;
  return store;
}

const deps = (user: string | null, store: InquiryStore): HandlerDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  access: { store: access, allowRealLearners: false, now: NOW },
});

const goodAssign = { template_id: "A-W1-VOLCANOES", version: 1, due_on: "2026-10-30", client_request_id: "req-12345678" };
const goodEvent = { kind: "reschedule", new_date: "2026-10-20", reason: "Con ốm" };

describe("S2 route handlers: access", () => {
  it("401 without a session on every handler", async () => {
    const s = makeStore();
    expect((await handleListTemplates(deps(null, s), AN)).status).toBe(401);
    expect((await handleListInquiries(deps(null, s), AN)).status).toBe(401);
    expect((await handleAssign(deps(null, s), AN, goodAssign)).status).toBe(401);
    expect((await handleActivityEvent(deps(null, s), ACT_AN, goodEvent)).status).toBe(401);
    expect(s.assign).not.toHaveBeenCalled();
    expect(s.recordEvent).not.toHaveBeenCalled();
  });

  it("403 for a student, even for their own learner", async () => {
    const s = makeStore();
    expect((await handleListTemplates(deps("studentAn", s), AN)).status).toBe(403);
    expect((await handleListInquiries(deps("studentAn", s), AN)).status).toBe(403);
    expect((await handleAssign(deps("studentAn", s), AN, goodAssign)).status).toBe(403);
    expect((await handleActivityEvent(deps("studentAn", s), ACT_AN, goodEvent)).status).toBe(403);
    expect(s.listPublishedTemplates).not.toHaveBeenCalled();
    expect(s.assign).not.toHaveBeenCalled();
  });

  it("404 outside scope: tutor of An on Nguyên, student on the other child, unknown activity", async () => {
    const s = makeStore();
    expect((await handleListTemplates(deps("tutorAn", s), NGUYEN)).status).toBe(404);
    expect((await handleListInquiries(deps("tutorAn", s), NGUYEN)).status).toBe(404);
    expect((await handleAssign(deps("tutorAn", s), NGUYEN, goodAssign)).status).toBe(404);
    expect((await handleActivityEvent(deps("tutorAn", s), ACT_NGUYEN, goodEvent)).status).toBe(404);
    expect((await handleActivityEvent(deps("studentAn", s), ACT_NGUYEN, goodEvent)).status).toBe(404);
    expect((await handleActivityEvent(deps("parent", s), "33333333-3333-4333-8333-333333333333", goodEvent)).status).toBe(404);
    expect((await handleActivityEvent(deps("parent", s), "not-a-uuid", goodEvent)).status).toBe(404);
    expect(s.assign).not.toHaveBeenCalled();
    expect(s.recordEvent).not.toHaveBeenCalled();
  });

  it("access is checked before the body: an outsider with a bad body still gets 404", async () => {
    const s = makeStore();
    expect((await handleAssign(deps("tutorAn", s), NGUYEN, { nonsense: true })).status).toBe(404);
    expect((await handleActivityEvent(deps("tutorAn", s), ACT_NGUYEN, undefined)).status).toBe(404);
  });
});

describe("S2 route handlers: happy paths", () => {
  it("lists templates for the learner's own track", async () => {
    const s = makeStore();
    const r = await handleListTemplates(deps("parent", s), NGUYEN);
    expect(r.status).toBe(200);
    expect(s.listPublishedTemplates).toHaveBeenCalledWith("B");
  });

  it("assign passes the caller's member id and the learner from requireAccess, answers 201", async () => {
    const s = makeStore();
    const r = await handleAssign(deps("tutorAn", s), AN, goodAssign);
    expect(r.status).toBe(201);
    expect(s.assign).toHaveBeenCalledWith({ ...goodAssign, learnerId: AN, byMemberId: "m-tutorAn" });
  });

  it("event: parent reschedules, tutor of An skips", async () => {
    const s = makeStore();
    expect((await handleActivityEvent(deps("parent", s), ACT_AN, goodEvent)).status).toBe(201);
    const r = await handleActivityEvent(deps("tutorAn", s), ACT_AN, { kind: "skip", reason: "Nghỉ lễ" });
    expect(r.status).toBe(201);
    expect(s.recordEvent).toHaveBeenLastCalledWith({ kind: "skip", reason: "Nghỉ lễ", activityId: ACT_AN, byMemberId: "m-tutorAn" });
  });
});

describe("S2 route handlers: validation and database errors", () => {
  it("400 for malformed assign bodies", async () => {
    const s = makeStore();
    const bad = [
      undefined,
      {},
      { ...goodAssign, template_id: "x" },
      { ...goodAssign, version: 0 },
      { ...goodAssign, due_on: "2026-02-31" },
      { ...goodAssign, due_on: "30/10/2026" },
      { ...goodAssign, client_request_id: "short" },
      { ...goodAssign, extra: 1 },
    ];
    for (const b of bad) expect((await handleAssign(deps("parent", s), AN, b)).status).toBe(400);
    expect(s.assign).not.toHaveBeenCalled();
  });

  it("400 for events without a reason or with a wrong date shape", async () => {
    const s = makeStore();
    const bad = [
      undefined,
      { kind: "skip" },
      { kind: "skip", reason: "" },
      { kind: "skip", reason: "  " },
      { kind: "skip", reason: "ab" },
      { kind: "reschedule", reason: "Con ốm" },
      { kind: "reschedule", new_date: "2026-13-01", reason: "Con ốm" },
      { kind: "skip", new_date: "2026-10-20", reason: "Nghỉ lễ" },
      { kind: "delete", reason: "Nghỉ lễ" },
    ];
    for (const b of bad) expect((await handleActivityEvent(deps("parent", s), ACT_AN, b)).status).toBe(400);
    expect(s.recordEvent).not.toHaveBeenCalled();
  });

  it("maps database errors: 42501→403, P0002→404, 23505→409, 23514→400; unknown errors propagate", async () => {
    const cases: [string, number][] = [["42501", 403], ["P0002", 404], ["23505", 409], ["23514", 400], ["22023", 400]];
    for (const [code, status] of cases) {
      const s = makeStore({ assign: async () => { throw new InquiryDbError(code, "x"); } });
      expect((await handleAssign(deps("parent", s), AN, goodAssign)).status).toBe(status);
    }
    const boom = makeStore({ recordEvent: async () => { throw new Error("db down"); } });
    await expect(handleActivityEvent(deps("parent", boom), ACT_AN, goodEvent)).rejects.toThrow("db down");
  });

  it("schemas accept the documented shapes", () => {
    expect(assignBodySchema.safeParse(goodAssign).success).toBe(true);
    expect(eventBodySchema.safeParse(goodEvent).success).toBe(true);
    expect(eventBodySchema.safeParse({ kind: "unskip", reason: "Làm lại bước này" }).success).toBe(true);
  });
});

describe("S2 views", () => {
  const ev = (id: number, at: string, kind: EventRow["kind"], new_date: string | null, reason = "lý do"): EventRow => ({
    id, activity_instance_id: ACT_AN, kind, new_date, reason, at,
  });

  it("effective schedule = latest reschedule; skip and unskip toggle independently", () => {
    expect(effectiveSchedule("2026-10-15", [])).toEqual({ date: "2026-10-15", plannedDate: "2026-10-15", skipped: false, lastReason: null });
    const s = effectiveSchedule("2026-10-15", [
      ev(2, "2026-10-10T10:00:00Z", "reschedule", "2026-10-22", "hai"),
      ev(1, "2026-10-09T10:00:00Z", "reschedule", "2026-10-18", "một"),
      ev(3, "2026-10-11T10:00:00Z", "skip", null, "ba"),
    ]);
    expect(s).toEqual({ date: "2026-10-22", plannedDate: "2026-10-15", skipped: true, lastReason: "ba" });
    const back = effectiveSchedule("2026-10-15", [ev(1, "t1", "skip", null), ev(2, "t2", "unskip", null)]);
    expect(back.skipped).toBe(false);
  });

  it("ties on time are broken by id", () => {
    const s = effectiveSchedule(null, [ev(5, "t", "reschedule", "2026-10-25"), ev(4, "t", "reschedule", "2026-10-24")]);
    expect(s.date).toBe("2026-10-25");
  });

  it("inquiry view carries steps and sources but no answers, keys or tutor script", () => {
    const view = buildInquiryViews(
      [{
        id: "i1", template_id: "A-W1-VOLCANOES", template_version: 1, assigned_at: "2026-10-14T00:00:00Z", due_on: "2026-10-30",
        snapshot: {
          template: { title_vi: "Núi lửa", big_question_en: "Why?", big_question_vi: "Vì sao?", week: 1, date_from: "2026-10-19", date_to: "2026-10-25" },
          sources: [{ id: "S1", version: 1, title: "Video", modality: "video", url: "https://example.org/v" }],
          steps: [{ step_no: 1, activity_type: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], target_ids: [], prompt_en: "Read.", time_min: 10, planned_date: "2026-10-19", self_check_vi: [], items: [{ id: "q1", kind: "mcq", stem: "?", options: ["a", "b"], target_id: null }] }],
        },
      }],
      [{ id: ACT_AN, inquiry_instance_id: "i1", step_no: 1, activity_type: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], target_ids: [], scheduled_for: "2026-10-19" }],
      [ev(1, "t", "reschedule", "2026-10-21")],
    );
    expect(view).toHaveLength(1);
    expect(view[0]!.steps[0]!.schedule.date).toBe("2026-10-21");
    expect(view[0]!.steps[0]!.itemCount).toBe(1);
    expect(view[0]!.sources[0]!.url).toBe("https://example.org/v");
    const json = JSON.stringify(view);
    for (const forbidden of ['"answer"', "explanation_vi", "prompt_vi", "review_note", "transcript", '"options"']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("template list keeps the newest version of each template, ordered by week", () => {
    const row = (id: string, version: number, week: number) => ({
      id, version, title_vi: id, big_question_en: "q", big_question_vi: "q", week, date_from: "2026-10-19", date_to: "2026-10-25", domain_bucket: "x", steps: [1, 2],
    });
    const v = buildTemplateViews([row("A-W2-X", 1, 2), row("A-W1-Y", 1, 1), row("A-W1-Y", 2, 1)]);
    expect(v.map((t) => `${t.id}@${t.version}`)).toEqual(["A-W1-Y@2", "A-W2-X@1"]);
    expect(v[0]!.stepCount).toBe(2);
  });
});

describe("S2 routes never touch answer keys", () => {
  it("no route or inquiry-lib source mentions the key tables", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const files = [...walk("lib/inquiries"), ...walk("app/api/activities"), ...walk("app/api/learners")];
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/item_keys|source_transcripts/);
    }
  });
});
