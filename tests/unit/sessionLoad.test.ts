import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; cols: string; eq: [string, string] | null; range: [number, number] | null }[] = [];
let result: Record<string, { data: unknown; error: unknown }> = {};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const c = { table, cols, eq: null as [string, string] | null, range: null as [number, number] | null };
        calls.push(c);
        const q = {
          eq: (a: string, b: string) => { c.eq = [a, b]; return q; },
          range: (a: number, b: number) => { c.range = [a, b]; return Promise.resolve(result[table]); },
        };
        return q;
      },
    }),
  }),
}));
import { loadSessionFacts } from "@/lib/sessions/load";

beforeEach(() => { calls.length = 0; result = {}; });

describe("loadSessionFacts", () => {
  it("reads only the structural columns of lesson_notes, never the text", async () => {
    result = {
      lesson_notes: { data: [{ id: "n1", session_date: "2026-11-03", supersedes_id: null, author_role: "tutor", published: false, created_at: "2026-11-03T10:00:00Z" }], error: null },
      lesson_note_units: { data: [{ lesson_note_id: "n1", curriculum_id: "c1", unit_code: "U13" }], error: null },
    };
    const r = await loadSessionFacts("L1");
    expect(r).toEqual({
      notes: [{ id: "n1", sessionDate: "2026-11-03", supersedesId: null, authorRole: "tutor", published: false, createdAt: "2026-11-03T10:00:00Z" }],
      taught: [{ noteId: "n1", curriculumId: "c1", unitCode: "U13" }],
    });
    const cols = calls.find((c) => c.table === "lesson_notes")!;
    expect(cols.cols).toBe("id, session_date, supersedes_id, author_role, published, created_at");
    for (const bad of ["goals", "observed", "note_for_parent", "message_to_learner", "weak_tag_keys"]) expect(cols.cols).not.toContain(bad);
    expect(cols.eq).toEqual(["learner_id", "L1"]);
    expect(cols.range).toEqual([0, 4999]);
  });
  it("null when the notes cannot be read", async () => {
    result = { lesson_notes: { data: null, error: { message: "boom" } }, lesson_note_units: { data: [], error: null } };
    expect(await loadSessionFacts("L1")).toBeNull();
  });
  it("a failure on the Units only drops the Units", async () => {
    result = { lesson_notes: { data: [], error: null }, lesson_note_units: { data: null, error: { message: "x" } } };
    expect(await loadSessionFacts("L1")).toEqual({ notes: [], taught: [] });
  });
});
