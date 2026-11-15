import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = { loadWeekFactsResult: vi.fn(), loadInbox: vi.fn(), loadStudioPending: vi.fn(), loadRetryPending: vi.fn(), loadSkillInbox: vi.fn(), loadPointInbox: vi.fn(), loadDraftList: vi.fn(), loadCurriculumCards: vi.fn(), loadImportPending: vi.fn(), loadSessionFacts: vi.fn() };
vi.mock("@/lib/review/load", () => ({ loadInbox: (...a: unknown[]) => m.loadInbox(...a) }));
vi.mock("@/lib/studio/load", () => ({ loadStudioPending: (...a: unknown[]) => m.loadStudioPending(...a), loadRetryPending: (...a: unknown[]) => m.loadRetryPending(...a), loadDraftList: (...a: unknown[]) => m.loadDraftList(...a), loadAiSettings: vi.fn() }));
vi.mock("@/lib/skills/load", () => ({ loadSkillInbox: (...a: unknown[]) => m.loadSkillInbox(...a) }));
vi.mock("@/lib/points/load", () => ({ loadPointInbox: (...a: unknown[]) => m.loadPointInbox(...a) }));
vi.mock("@/lib/curriculum/load", () => ({ loadCurriculumCards: (...a: unknown[]) => m.loadCurriculumCards(...a) }));
vi.mock("@/lib/import/load", () => ({ loadImportPending: (...a: unknown[]) => m.loadImportPending(...a) }));
vi.mock("@/lib/tutorwork/load", () => ({ loadToday: vi.fn() }));
vi.mock("@/lib/workdesk/load", () => ({ loadIntake: vi.fn() }));
vi.mock("@/lib/sessions/load", () => ({ loadSessionFacts: (...a: unknown[]) => m.loadSessionFacts(...a) }));
vi.mock("@/lib/roadmap/load", () => ({ loadRoadmap: vi.fn().mockResolvedValue({ kind: "unavailable" }) }));
vi.mock("@/lib/student/weekLoad", () => ({ loadWeekFactsResult: (...a: unknown[]) => m.loadWeekFactsResult(...a) }));
vi.mock("@/lib/levels/load", () => ({ loadLevelProfile: vi.fn(), loadRecentLevelChanges: vi.fn() }));

import { loadDesk, loadPendingRows } from "@/lib/desk/load";
import { PENDING_MAX_PAGES, PENDING_PAGE_SIZE } from "@/lib/desk/pending";

beforeEach(() => {
  m.loadInbox.mockResolvedValue({ items: [], next: null, counts: {} });
  m.loadStudioPending.mockResolvedValue({ count: 0, attempts: [] });
  m.loadRetryPending.mockResolvedValue({ count: 0, attempts: [] });
  m.loadSkillInbox.mockResolvedValue({ open: 0, decidable: 0, items: [] });
  m.loadPointInbox.mockResolvedValue({ open: 0, decidable: 0, items: [] });
  m.loadDraftList.mockResolvedValue([]);
  m.loadCurriculumCards.mockResolvedValue([]);
  m.loadImportPending.mockResolvedValue([]);
  m.loadWeekFactsResult.mockResolvedValue({ kind: "unavailable" }); // 0035 not applied: not a fault
});

describe("loadPendingRows", () => {
  it("reads the S5 inbox (todo) (page size 100), and the per-child sources for this child", async () => {
    await loadPendingRows("m1", "tutor", "L1");
    expect(m.loadInbox).toHaveBeenCalledWith("todo", null, PENDING_PAGE_SIZE);
    expect(m.loadStudioPending).toHaveBeenCalledWith("m1");
    expect(m.loadRetryPending).toHaveBeenCalledWith("m1");
    expect(m.loadSkillInbox).toHaveBeenCalledWith("m1");
    expect(m.loadPointInbox).toHaveBeenCalledWith("m1");
    expect(m.loadDraftList).toHaveBeenCalledWith("L1");
    expect(m.loadCurriculumCards).toHaveBeenCalledWith("L1");
    expect(m.loadImportPending).toHaveBeenCalledWith("m1");
  });
  it("imports not ready (0027 not applied) are named `imports`; the others still show", async () => {
    m.loadImportPending.mockResolvedValue(null);
    expect((await loadPendingRows("m1", "tutor", "L1")).failed).toEqual(["imports"]);
  });
  it("one failing / not-ready source does not take the page down: it is named in `failed`", async () => {
    m.loadStudioPending.mockResolvedValue(null); // 0024 not applied
    m.loadDraftList.mockRejectedValue(new Error("eng_studio_drafts failed"));
    const r = await loadPendingRows("m1", "tutor", "L1");
    expect(r.failed).toEqual(["studio", "drafts"]);
    expect(r.rows).toEqual([]);
  });
  it("knowledge points not ready (0027 not applied) is named `points`; the others still show", async () => {
    m.loadPointInbox.mockResolvedValue(null);
    expect((await loadPendingRows("m1", "tutor", "L1")).failed).toEqual(["points"]);
  });
  it("follows the cursor until the inbox is exhausted (the RPC cannot filter by child), keeping only this child's rows", async () => {
    const it = (id: string, learnerId: string) => ({ episodeId: id, learnerId, titleVi: "T", activityType: "x", submittedAt: "2026-11-01T00:00:00Z", targetsDecided: 0, targetsTotal: 1, canDecide: true, revisionRound: null });
    m.loadInbox
      .mockResolvedValueOnce({ items: [it("e1", "L2")], next: { at: "2026-11-01T00:00:00Z", id: "e1" }, counts: {} })
      .mockResolvedValueOnce({ items: [it("e2", "L1")], next: null, counts: {} });
    const r = await loadPendingRows("m1", "parent", "L1");
    expect(m.loadInbox).toHaveBeenCalledTimes(2);
    expect(m.loadInbox).toHaveBeenLastCalledWith("todo", { at: "2026-11-01T00:00:00Z", id: "e1" }, PENDING_PAGE_SIZE);
    expect(r.rows.map((x) => x.key)).toEqual(["work-e2"]);
    expect(r.more).toBe(false);
  });
  it("`more` when the page limit is reached and the inbox still has another page", async () => {
    m.loadInbox.mockResolvedValue({ items: [], next: { at: "2026-11-01T00:00:00Z", id: "x" }, counts: {} });
    const r = await loadPendingRows("m1", "parent", "L1");
    expect(m.loadInbox).toHaveBeenCalledTimes(PENDING_MAX_PAGES);
    expect(r.more).toBe(true);
  });
  it("a failing page makes the whole work source `failed`", async () => {
    m.loadInbox.mockRejectedValue(new Error("rpc"));
    expect((await loadPendingRows("m1", "parent", "L1")).failed).toEqual(["work"]);
  });
});

describe("loadDesk: session days", () => {
  const shell = { role: "tutor", memberId: "m1", learners: [] } as never;
  const learner = { id: "L1", trackId: "B" } as never;
  it("counts the notes in `settle`: a failure gives sessions null and the desk still builds", async () => {
    m.loadSessionFacts.mockResolvedValue({ notes: [{ id: "n1", sessionDate: "2026-11-03", supersedesId: null, authorRole: "tutor", published: false, createdAt: "x" }], taught: [] });
    expect((await loadDesk(shell, learner)).sessions?.map((d) => d.date)).toEqual(["2026-11-03"]);
    m.loadSessionFacts.mockRejectedValue(new Error("boom"));
    expect((await loadDesk(shell, learner)).sessions).toBeNull();
    m.loadSessionFacts.mockResolvedValue(null);
    expect((await loadDesk(shell, learner)).sessions).toBeNull();
  });
});

describe("loadPendingRows · weekly goal (W4d)", () => {
  const facts = (goals: unknown[]) => ({ kind: "ok", facts: { now: "2026-11-12T03:00:00Z", range: { min: 3, max: 6 }, goals, works: [], firstWorkAt: null, writes: [], firstTopicAt: null, firstRevisionAt: null, unitEvents: [] } });
  const proposal = { id: "g1", kind: "propose", pieces: 5, appliesFrom: null, respondsTo: null, byRole: "student", createdAt: "2026-11-11T03:00:00Z" };
  it("migration 0035 not applied is NOT a failure (the count stays known)", async () => {
    const r = await loadPendingRows("m1", "tutor", "L1");
    expect(r.failed).toEqual([]);
    expect(r.rows).toEqual([]);
  });
  it("a proposal nobody answered becomes one row that only LINKS to the goal box of the desk", async () => {
    m.loadWeekFactsResult.mockResolvedValue(facts([proposal]));
    const r = await loadPendingRows("m1", "tutor", "L1");
    expect(m.loadWeekFactsResult).toHaveBeenCalledWith("L1");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ key: "goal-g1", kind: "goal", group: "roadmap", href: "/?learner=L1#goal-box", waitingTutor: false });
    expect((await loadPendingRows("m1", "parent", "L1")).rows[0]).toMatchObject({ waitingTutor: true });
  });
  it("an answered or withdrawn proposal is not a row", async () => {
    m.loadWeekFactsResult.mockResolvedValue(facts([proposal, { ...proposal, id: "g2", kind: "withdraw", pieces: null, respondsTo: "g1", createdAt: "2026-11-11T04:00:00Z" }]));
    expect((await loadPendingRows("m1", "tutor", "L1")).rows).toEqual([]);
  });
  it("a real fault is named `goals`; the other sources still show", async () => {
    m.loadWeekFactsResult.mockRejectedValue(new Error("eng_week_facts failed: 500"));
    const r = await loadPendingRows("m1", "tutor", "L1");
    expect(r.failed).toEqual(["goals"]);
  });
  it("loadDesk gives the goal box its numbers (null when not applied)", async () => {
    const learner = { id: "L1", alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null } as never;
    const shell = { displayName: "X", role: "tutor", memberId: "m1", learners: [learner], current: learner, revisionsReady: true } as never;
    expect((await loadDesk(shell, learner)).goal).toBeNull();
    m.loadWeekFactsResult.mockResolvedValue(facts([proposal]));
    const d = await loadDesk(shell, learner);
    expect(d.goal).toMatchObject({ goal: null, pending: { id: "g1", pieces: 5 }, streak: 0 });
    expect(m.loadWeekFactsResult).toHaveBeenCalledTimes(2); // once per desk load (shared by the inbox row and the box)
  });
});
