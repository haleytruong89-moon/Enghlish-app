import { describe, expect, it } from "vitest";
import { parseAssignments, parseReviewPoints, parseStudentFile, parseStudentPractice } from "@/lib/practice/shape";

describe("practice parsers", () => {
  it("parses a staff overview row, with null file / submission / result", () => {
    const [a] = parseAssignments([
      { id: "a1", kind: "link", title: "T", url: "https://test-english.com/x", source_key: "test-english", tag_keys: ["dang-tu"], due_on: "2026-10-20", frame_id: null, created_at: "2026-10-17T10:00:00Z", retracted_at: null, file: null, answer_file: null, submission: null, result_id: null },
    ]);
    expect(a).toMatchObject({ id: "a1", kind: "link", sourceKey: "test-english", tagKeys: ["dang-tu"], dueOn: "2026-10-20", file: null, submission: null, resultId: null });
  });
  it("parses a submission with its files in order", () => {
    const [a] = parseAssignments([
      { id: "a2", kind: "pdf", title: "KET", created_at: "2026-10-17T10:00:00Z", file: { id: "f1", mime: "application/pdf", bytes: 10 }, source_key: null,
        submission: { id: "s1", created_at: "2026-10-17T11:00:00Z", attempt: "retry", used_hint: true, link_url: null, by_role: "tutor", files: [{ id: "f2", mime: "image/png", bytes: 5 }, { id: "f3", mime: "image/jpeg", bytes: 6 }] } },
    ]);
    expect(a?.submission).toMatchObject({ attempt: "retry", usedHint: true, byRole: "tutor" });
    expect(a?.submission?.files.map((f) => f.id)).toEqual(["f2", "f3"]);
  });
  it("throws on a shape it does not know (so a half-right page is never shown)", () => {
    expect(() => parseAssignments([{ id: "a", kind: "video", title: "x", created_at: "x" }])).toThrow();
    expect(() => parseAssignments("nope")).toThrow();
  });

  it("the student list keeps ONLY the allowed fields, even if more come back", () => {
    const [item] = parseStudentPractice([
      { assignment_id: "a1", kind: "link", title: "T", source_key: "notebooklm", url: "https://notebooklm.google.com/x", has_file: false, due_on: null, assigned_on: "2026-10-17", reviewed: false,
        tag_keys: ["dang-tu"], frame_id: "frame", result_id: "r1", answer_file: { id: "k" }, score: 8,
        submission: { submitted_at: "2026-10-17T11:00:00Z", attempt: "first", used_hint: false, file_count: 1, has_link: false, correct: 8 } },
    ]);
    expect(item).toEqual({
      assignmentId: "a1", kind: "link", title: "T", sourceKey: "notebooklm", url: "https://notebooklm.google.com/x", hasFile: false, dueOn: null, assignedOn: "2026-10-17", reviewed: false,
      submission: { submittedAt: "2026-10-17T11:00:00Z", attempt: "first", usedHint: false, fileCount: 1, hasLink: false },
    });
    expect(JSON.stringify(item)).not.toMatch(/tag_keys|frame|result|answer|score|correct/);
  });

  it("review points: labels and message only; nothing → null", () => {
    expect(parseReviewPoints(null)).toBeNull();
    expect(parseReviewPoints({ session_date: "2026-10-17", message: "  ", labels: [] })).toBeNull();
    expect(parseReviewPoints({ session_date: "2026-10-17", message: " Nhớ -es nhé ", labels: ["Dạng từ"], note_for_parent: "secret" })).toEqual({
      sessionDate: "2026-10-17", message: "Nhớ -es nhé", labels: ["Dạng từ"],
    });
  });

  it("student file lookup", () => {
    expect(parseStudentFile(null)).toBeNull();
    expect(parseStudentFile({ file_id: "f", path: "p", mime: "application/pdf", title: "T" })).toEqual({ fileId: "f", path: "p", mime: "application/pdf", title: "T" });
  });
});
