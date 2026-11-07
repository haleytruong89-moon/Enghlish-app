import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { field: string; text: string; author_member: string; created_at: string };
type Err = { code?: string; message?: string };
const state: { notes: Row[]; error: Err | null } = { notes: [], error: null };

/** A tiny PostgREST-like query builder over `state.notes`: eq / order / limit are honoured, so the loader's queries really filter. */
function builder(table: string) {
  const filters: [string, unknown][] = [];
  let limit = Infinity;
  let desc = false;
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    in: () => b,
    order: (_c: string, o: { ascending: boolean }) => ((desc = !o.ascending), b),
    limit: (n: number) => ((limit = n), b),
    then: (res: (v: { data: unknown; error: Err | null }) => unknown) => {
      if (state.error) return Promise.resolve({ data: null, error: state.error }).then(res);
      let rows: Row[] = table === "teaching_notes" ? [...state.notes] : [];
      for (const [c, v] of filters.filter(([c]) => c === "field")) rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[c] === v);
      rows.sort((a, c) => (desc ? (a.created_at < c.created_at ? 1 : -1) : a.created_at < c.created_at ? -1 : 1));
      return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(res);
    },
  };
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "t1", display_name: "Cô Lan" }], error: null }) }) }) }) }));

import { loadAppFeedback, loadIntake, loadTeachingNotes } from "@/lib/workdesk/load";
import { isMissingRelation } from "@/lib/workdesk/missing";

beforeEach(() => {
  state.notes = [];
  state.error = null;
});

describe("M1: every field keeps its own newest row", () => {
  it("a field written long ago still shows after 50 edits of another field", async () => {
    state.notes.push({ field: "avoid", text: "Không dạy tuần thi", author_member: "t1", created_at: "2026-01-01T00:00:00.000Z" });
    for (let i = 0; i < 50; i++) state.notes.push({ field: "focus", text: `Tập trung ${i}`, author_member: "t1", created_at: new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString() });
    const r = await loadTeachingNotes("L1");
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.data.fields.avoid?.text).toBe("Không dạy tuần thi");
    expect(r.data.fields.focus?.text).toBe("Tập trung 49");
    expect(r.data.fields.explain).toBeNull();
  });
});

describe("M2: migration 0025 missing -> unavailable, never a throw", () => {
  it("recognises the missing-relation errors", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205" })).toBe(true);
    expect(isMissingRelation({ message: 'relation "english.teaching_notes" does not exist' })).toBe(true);
    expect(isMissingRelation({ message: "Could not find the table 'english.app_feedback' in the schema cache" })).toBe(true);
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
  it("all three loaders answer { available: false }", async () => {
    state.error = { code: "PGRST205", message: "Could not find the table" };
    expect(await loadTeachingNotes("L1")).toEqual({ available: false });
    expect(await loadIntake("L1")).toEqual({ available: false });
    expect(await loadAppFeedback()).toEqual({ available: false });
  });
  it("any other error still throws (the page error is logged, not hidden)", async () => {
    state.error = { code: "XX000", message: "boom" };
    await expect(loadTeachingNotes("L1")).rejects.toThrow(/failed/);
  });
});
