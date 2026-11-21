import { describe, expect, it } from "vitest";
import { proposeFromSentWork } from "@/lib/curriculum/workProposal";

describe("Đang học proposals from sent work (bản rà 21/11 #10)", () => {
  const C = "cur-1";
  const status = { U13: "not_started", U14: "not_started", U15: "in_progress", U16: "done" } as const;
  it("only Units of this curriculum that have not started; titles gathered once; newest sent first", () => {
    const p = proposeFromSentWork(C, [
      { curriculumId: C, unitCode: "U14", title: "Unit 14 · Idioms", sentAt: "2026-11-20T02:00:00Z" },
      { curriculumId: C, unitCode: "U14", title: "Unit 14 · Idioms", sentAt: "2026-11-21T02:00:00Z" },
      { curriculumId: C, unitCode: "U14", title: "Unit 14 · Word formation", sentAt: "2026-11-19T02:00:00Z" },
      { curriculumId: C, unitCode: "U13", title: "Unit 13", sentAt: "2026-11-18T02:00:00Z" },
      { curriculumId: C, unitCode: "U15", title: "Unit 15", sentAt: "2026-11-21T05:00:00Z" }, // already in progress
      { curriculumId: C, unitCode: "U16", title: "Unit 16", sentAt: "2026-11-21T05:00:00Z" }, // done: never proposed again
      { curriculumId: C, unitCode: "U99", title: "dropped", sentAt: "2026-11-21T05:00:00Z" }, // not in the version in use
      { curriculumId: "other", unitCode: "U13", title: "x", sentAt: "2026-11-21T05:00:00Z" },
    ], status);
    expect(p).toEqual([
      { code: "U14", titles: ["Unit 14 · Idioms", "Unit 14 · Word formation"], lastSentAt: "2026-11-21T02:00:00Z" },
      { code: "U13", titles: ["Unit 13"], lastSentAt: "2026-11-18T02:00:00Z" },
    ]);
  });
  it("a Unit the version skips is never proposed; empty titles are left out", () => {
    const rows = [
      { curriculumId: C, unitCode: "U13", title: "", sentAt: "2026-11-18T02:00:00Z" },
      { curriculumId: C, unitCode: "U14", title: "Unit 14", sentAt: "2026-11-18T02:00:00Z" },
    ];
    expect(proposeFromSentWork(C, rows, status, new Set(["U14"]))).toEqual([{ code: "U13", titles: [], lastSentAt: "2026-11-18T02:00:00Z" }]);
  });
  it("nothing sent, nothing proposed", () => {
    expect(proposeFromSentWork(C, [], status)).toEqual([]);
  });
});
