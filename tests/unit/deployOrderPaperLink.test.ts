import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy order: the code of W4c1 may reach production BEFORE migration 0033 is applied. Sending work must keep working with the old function
 * (up to 6 files; a PDF has no hint answer there), say so clearly for more pages, and every other database error must still surface.
 */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ rpc }) }));

import { createSupabasePracticeStore } from "@/lib/practice/supabaseStore";
import { loadAssignments } from "@/lib/practice/load";
import { ReviewDbError } from "@/lib/review/handlers";

const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
const files = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, mime: "image/jpeg" as const, bytes: 10 }));
const args = (over: Record<string, unknown> = {}) => ({
  assignmentId: "a1", kind: "pdf" as const, byMemberId: "m1", clientId: "client-0001", attempt: "first", usedHint: true, linkUrl: null, files: files(2), ...over,
});

beforeEach(() => {
  rpc.mockReset();
});

describe("sending work before and after 0033", () => {
  it("with 0033 applied it calls the v2 function with the hint answer, whatever the kind", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "s1", replayed: false }, error: null });
    await createSupabasePracticeStore().submit(args());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("eng_submit_practice_v2", expect.objectContaining({ p_used_hint: true, p_files: files(2) }));
  });

  it("without 0033 it falls back to the old function: a PDF sends no hint answer (the old one refuses it), a link keeps it", async () => {
    rpc.mockResolvedValueOnce(missing).mockResolvedValueOnce({ data: { id: "s1", replayed: false }, error: null });
    await createSupabasePracticeStore().submit(args());
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["eng_submit_practice_v2", "eng_submit_practice"]);
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_used_hint: null });
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "x" } }).mockResolvedValueOnce({ data: { id: "s2", replayed: false }, error: null });
    await createSupabasePracticeStore().submit(args({ kind: "link", usedHint: false }));
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_used_hint: false });
  });

  it("without 0033, more than 6 pages is a clear 'pages_unavailable', not a database error", async () => {
    rpc.mockResolvedValueOnce(missing);
    const err = await createSupabasePracticeStore().submit(args({ files: files(7) })).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ReviewDbError);
    expect((err as ReviewDbError).code).toBe("pages_unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("any other error of the v2 function is not hidden by the fallback", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "x (already_reviewed)" } });
    const err = await createSupabasePracticeStore().submit(args()).then(() => null, (e: unknown) => e);
    expect((err as ReviewDbError).code).toBe("23505");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("the assignment list before and after 0033", () => {
  const row = { id: "a1", kind: "link", title: "T", created_at: "2026-11-14T00:00:00Z", submission: { id: "s1", created_at: "2026-11-15T00:00:00Z", attempt: "first", by_role: "student", files: [] } };

  it("without the feedback function the list shows as before (no feedback)", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "eng_assignment_overview" ? { data: [row], error: null } : missing));
    const list = await loadAssignments("L1", { units: false });
    expect(list).toHaveLength(1);
    expect(list[0]!.feedback).toEqual([]);
  });

  it("with it, each note lands on its assignment; a real error is not swallowed", async () => {
    const note = { id: "f1", submission_id: "s1", assignment_id: "a1", praise: "Tốt", items: [], author_member: "m1", author_role: "tutor", author_name: null, created_at: "2026-11-15T01:00:00Z", live: true };
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "eng_assignment_overview" ? [row] : [note], error: null }));
    expect((await loadAssignments("L1", { units: false }))[0]!.feedback.map((f) => f.id)).toEqual(["f1"]);
    rpc.mockImplementation(async (fn: string) => (fn === "eng_assignment_overview" ? { data: [row], error: null } : { data: null, error: { code: "XX000", message: "boom" } }));
    await expect(loadAssignments("L1", { units: false })).rejects.toThrow(/eng_submission_feedback failed/);
  });
});
