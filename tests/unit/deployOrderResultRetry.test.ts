import { beforeEach, describe, expect, it, vi } from "vitest";
import { modeText } from "@/components/student/desk/taskText";
import { parseTestMarks } from "@/lib/student/shape";
import type { Task } from "@/lib/student/types";

/** Deploy order: the code of W4c2 may reach production BEFORE migration 0034 is applied. Everything without the "Bài kiểm tra" flag keeps the older calls. */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ rpc }) }));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { id: "x", replayed: false }, error: null });
});

describe("assigning before and after 0034", () => {
  const base = { learnerId: "L", kind: "link" as const, url: "https://x.example", title: "T", tags: [], units: [], dueOn: null, frameId: null, files: null, byMemberId: "M", clientId: "client-0001" };
  it("link / PDF: without the flag the older function; with it v3; v3 missing → test_flag_unavailable", async () => {
    const { createSupabasePracticeStore } = await import("@/lib/practice/supabaseStore");
    await createSupabasePracticeStore().createAssignment(base);
    expect(rpc.mock.calls[0]?.[0]).toBe("eng_create_assignment");
    await createSupabasePracticeStore().createAssignment({ ...base, isTest: true });
    expect(rpc.mock.calls[1]?.[0]).toBe("eng_create_assignment_v3");
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_is_test: true, p_units: [] });
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "none" } });
    await expect(createSupabasePracticeStore().createAssignment({ ...base, isTest: true })).rejects.toMatchObject({ code: "test_flag_unavailable" });
  });
  it("Studio: without the flag v1; with it v2", async () => {
    const { createSupabaseStudioStore } = await import("@/lib/studio/supabaseStore");
    const args = { draftId: "d", startOn: "2026-11-15", dueOn: "2026-11-20", byMemberId: "M", clientId: "client-0001" };
    await createSupabaseStudioStore().assign({ ...args, isTest: false });
    expect(rpc.mock.calls[0]?.[0]).toBe("eng_assign_studio");
    await createSupabaseStudioStore().assign({ ...args, isTest: true });
    expect(rpc.mock.calls[1]?.[0]).toBe("eng_assign_studio_v2");
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_is_test: true });
  });
});

describe("the child's desk labels a test", () => {
  const task = { kind: "app", activityId: "a", assignmentId: null, stepNo: 1, activityType: "ACT-SOURCE-QA", title: "T", dueOn: null, opensOn: "", timeMin: null, doable: true, practice: true, mode: "PRACTICE", purpose: [], offLabel: null, hasDraft: false, draftAt: null, filled: null, total: null } satisfies Task;
  it("a flagged work says 'Bài kiểm tra'; a practice one does not", () => {
    expect(modeText({ ...task, isTest: true })).toBe("Bài kiểm tra");
    expect(modeText(task)).not.toBe("Bài kiểm tra");
  });
  it("test marks: only the two id lists are accepted", () => {
    expect(parseTestMarks({ activity_ids: ["a"], assignment_ids: [] }).activityIds.has("a")).toBe(true);
    expect(() => parseTestMarks({ activity_ids: [], assignment_ids: [], by: "x" })).toThrow();
  });
});
