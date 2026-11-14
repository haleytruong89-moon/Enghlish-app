import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; cols: string; eq: [string, string] | null; range: [number, number] | null; orders: string[] }[] = [];
let pages: ((table: string, from: number) => { data: unknown; error: unknown }) | null = null;
let result: Record<string, { data: unknown; error: unknown }> = {};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const c = { table, cols, eq: null as [string, string] | null, range: null as [number, number] | null, orders: [] as string[] };
        calls.push(c);
        const q = {
          eq: (a: string, b: string) => { c.eq = [a, b]; return q; },
          order: (col: string) => { c.orders.push(col); return q; },
          range: (a: number, b: number) => { c.range = [a, b]; return Promise.resolve(pages ? pages(table, a) : result[table]); },
        };
        return q;
      },
    }),
  }),
}));
import { loadSessionFacts } from "@/lib/sessions/load";

beforeEach(() => { calls.length = 0; result = {}; pages = null; });

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
    expect(cols.range).toEqual([0, 999]);
    expect(cols.orders).toEqual(["session_date", "id"]);
  });
  it("null when the notes cannot be read", async () => {
    result = { lesson_notes: { data: null, error: { message: "boom" } }, lesson_note_units: { data: [], error: null } };
    expect(await loadSessionFacts("L1")).toBeNull();
  });
  it("a failure on the Units only drops the Units", async () => {
    result = { lesson_notes: { data: [], error: null }, lesson_note_units: { data: null, error: { message: "x" } } };
    expect(await loadSessionFacts("L1")).toEqual({ notes: [], taught: [] });
  });
  it("pages through more than one page of notes in a stable order", async () => {
    const row = (i: number) => ({ id: `n${i}`, session_date: "2026-11-03", supersedes_id: null, author_role: "tutor", published: true, created_at: "x" });
    pages = (table, from) => (table === "lesson_notes" ? { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => row(i)) : [row(1000)], error: null } : { data: [], error: null });
    const r = await loadSessionFacts("L1");
    expect(r!.notes).toHaveLength(1001);
    expect(calls.filter((c) => c.table === "lesson_notes").map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
  });
});
