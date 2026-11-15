import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeekView } from "@/lib/student/weekView";

/** Deploy order: the code of W4d may reach production BEFORE migration 0035 is applied. Nothing may fail loudly; the screens just leave the goal out. */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ rpc }) }));

const MISSING = { data: null, error: { code: "PGRST202", message: "none" } };
const FACTS = { now: "2026-11-12T03:00:00Z", range: { min: 2, max: 5 }, goals: [], works: [], first_work_at: null, writes: [], first_topic_at: null, first_revision_at: null, unit_events: [] };
beforeEach(() => {
  rpc.mockReset();
});

describe("before 0035", () => {
  it("the child's week is null (no chip, no card, no error); a real fault is null too, never a thrown error", async () => {
    const { loadMyWeek, loadMyWeekView } = await import("@/lib/student/weekLoad");
    rpc.mockResolvedValue(MISSING);
    expect(await loadMyWeek()).toBeNull();
    expect(await loadMyWeekView()).toBeNull();
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await loadMyWeek()).toBeNull();
  });
  it("a network fault is null too", async () => {
    const { loadMyWeek } = await import("@/lib/student/weekLoad");
    rpc.mockImplementation(() => Promise.reject(new Error("network")));
    expect(await loadMyWeek()).toBeNull();
  });
  it("the adult read tells 'not applied' ({unavailable}, the inbox count stays known) from a real fault (thrown, the source is named failed)", async () => {
    const { loadWeekFactsResult } = await import("@/lib/student/weekLoad");
    rpc.mockResolvedValue(MISSING);
    expect(await loadWeekFactsResult("L")).toEqual({ kind: "unavailable" });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(loadWeekFactsResult("L")).rejects.toThrow(/eng_week_facts failed/);
  });
  it("after 0035: the child's facts parse and give a view; the adult read goes through the service role function", async () => {
    const { loadMyWeekView, loadWeekFactsResult } = await import("@/lib/student/weekLoad");
    rpc.mockResolvedValue({ data: FACTS, error: null });
    const mine = await loadMyWeekView();
    expect(rpc).toHaveBeenLastCalledWith("eng_my_week");
    expect(mine?.view).toMatchObject({ week: "2026-11-09", goal: null, count: 0, streak: 0, range: { min: 2, max: 5 } });
    expect(mine?.view).toEqual(buildWeekView(mine!.facts));
    const adult = await loadWeekFactsResult("L1");
    expect(rpc).toHaveBeenLastCalledWith("eng_week_facts", { p_learner: "L1" });
    expect(adult.kind).toBe("ok");
  });
  it("the writes answer 409 goal_unavailable, never 500", async () => {
    const { createSupabaseGoalStore } = await import("@/lib/goal/supabaseStore");
    rpc.mockResolvedValue(MISSING);
    const st = createSupabaseGoalStore();
    await expect(st.propose({ pieces: 4, clientId: "client-0001" })).rejects.toMatchObject({ code: "goal_unavailable" });
    await expect(st.withdraw({ goalId: "g", clientId: "client-0001" })).rejects.toMatchObject({ code: "goal_unavailable" });
    await expect(st.decide({ goalId: "g", action: "accept", pieces: null, byMemberId: "m", clientId: "client-0001", learnerId: "L" })).rejects.toMatchObject({ code: "goal_unavailable" });
  });
});
