import { describe, expect, it } from "vitest";
import { parseFeedback, parseIntake, parseTeachingNotes } from "@/lib/workdesk/shape";

const name = (id: string) => ({ t1: "Cô Lan", p1: "Mẹ" })[id] ?? "";

describe("parseTeachingNotes", () => {
  it("takes the newest row of each field; a missing or cleared field is null", () => {
    const v = parseTeachingNotes(
      [
        { field: "focus", text: "cũ", author_member: "t1", created_at: "2026-11-01T00:00:00Z" },
        { field: "focus", text: "mới", author_member: "t1", created_at: "2026-11-05T00:00:00Z" },
        { field: "avoid", text: "x", author_member: "t1", created_at: "2026-11-02T00:00:00Z" },
        { field: "avoid", text: "  ", author_member: "t1", created_at: "2026-11-03T00:00:00Z" },
      ],
      name,
    );
    expect(v.fields.focus).toEqual({ text: "mới", at: "2026-11-05T00:00:00Z", authorName: "Cô Lan" });
    expect(v.fields.avoid).toBeNull();
    expect(v.fields.explain).toBeNull();
    expect(v.updatedAt).toBe("2026-11-05T00:00:00Z");
    expect(parseTeachingNotes([], name)).toMatchObject({ updatedAt: null });
  });
});

describe("parseIntake", () => {
  it("null when empty; tolerates a missing note and drops unknown domains", () => {
    expect(parseIntake([], name)).toBeNull();
    const v = parseIntake([{ content: { goals: [{ title: "Thi vào 10" }], strengths: { vocab: "ok", music: "x" } }, author_member: "t1", created_at: "2026-11-01T00:00:00Z" }], name);
    expect(v).toMatchObject({ goals: [{ title: "Thi vào 10", due: null }], strengths: { vocab: "ok" }, weaknesses: {}, note: "", authorName: "Cô Lan" });
  });
  it("newest row wins", () => {
    const v = parseIntake(
      [
        { content: { goals: [], note: "a" }, author_member: "t1", created_at: "2026-11-01T00:00:00Z" },
        { content: { goals: [], note: "b" }, author_member: "t1", created_at: "2026-11-04T00:00:00Z" },
      ],
      name,
    );
    expect(v?.note).toBe("b");
  });
});

describe("parseFeedback", () => {
  const fb = (id: string, at: string) => ({ id, kind: "bug", screen: "S", text: "t", by_member: "t1", by_role: "tutor", created_at: at });
  it("status and reply both come from the newest event (a later event without a reply shows none); 'new' first, then newest first", () => {
    const v = parseFeedback(
      [fb("a", "2026-11-01T00:00:00Z"), fb("b", "2026-11-02T00:00:00Z"), fb("c", "2026-11-03T00:00:00Z")],
      [
        { feedback_id: "a", status: "new", reply: null, created_at: "2026-11-01T00:00:00Z" },
        { feedback_id: "a", status: "in_progress", reply: "Sẽ sửa", created_at: "2026-11-04T00:00:00Z" },
        { feedback_id: "a", status: "done", reply: null, created_at: "2026-11-05T00:00:00Z" },
        { feedback_id: "b", status: "new", reply: null, created_at: "2026-11-02T00:00:00Z" },
        { feedback_id: "c", status: "wont_do", reply: "Không", created_at: "2026-11-03T01:00:00Z" },
      ],
      name,
    );
    expect(v.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(v[2]).toMatchObject({ status: "done", reply: null, byName: "Cô Lan" });
  });
});
