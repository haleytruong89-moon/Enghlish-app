import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { tutorWorkErrors } from "@/lib/copy/vi";
import { ReviewDbError } from "@/lib/review/handlers";
import { parseNotes } from "@/lib/review/shape";
import { normalizeFrame, frameFileSchema, scaleBand } from "@/lib/frames/frame";
import { customTagKey, itemList, parseItemNumbers, scoreFrame } from "@/lib/tutorwork/frameScore";
import {
  handleAddTag,
  handleRecordResult,
  handleSetTagGroup,
  handleTagEpisode,
  handleTagResultItems,
  handleWriteSessionNote,
  type TutorWorkDeps,
  type TutorWorkStore,
} from "@/lib/tutorwork/handlers";
import { failText } from "@/lib/tutorwork/client";
import { resultBodySchema, sessionNoteBodySchema, tagItemsBodySchema, writingTagsBodySchema } from "@/lib/tutorwork/schemas";
import { parseLastNote, parseTags, parseUntagged, parseWeakPoints } from "@/lib/tutorwork/shape";
import type { FrameView, UntaggedItem } from "@/lib/tutorwork/types";
import { filterUntagged, windowSince } from "@/lib/tutorwork/window";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const RESULT_AN = "11111111-1111-4111-8111-111111111111";
const EPISODE_AN = "22222222-2222-4222-8222-222222222222";
const FRAME = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-17T08:00:00Z");

const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentAn", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: null, alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};

function makeStore(over: Partial<TutorWorkStore> = {}) {
  return {
    getResultLearnerId: vi.fn(async (id: string) => (id === RESULT_AN ? AN : null)),
    getEpisodeLearnerId: vi.fn(async (id: string) => (id === EPISODE_AN ? AN : null)),
    recordResult: vi.fn(async () => ({ id: "r1", replayed: false, untagged: 2 })),
    tagResultItems: vi.fn(async () => ({ tagged: 2, replayed: false })),
    addTag: vi.fn(async (a: { key: string; label: string; groupKey: string }) => ({ key: a.key, label_vi: a.label, group_key: a.groupKey, created: true })),
    setTagGroup: vi.fn(async (a: { tagKey: string; groupKey: string }) => ({ key: a.tagKey, group_key: a.groupKey, changed: true })),
    tagEpisode: vi.fn(async () => ({ added: 1, replayed: false })),
    writeSessionNote: vi.fn(async () => ({ id: "n1", replayed: false })),
    ...over,
  } satisfies TutorWorkStore;
}
const deps = (user: string | null, store: TutorWorkStore): TutorWorkDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  access: { store: access, allowRealLearners: false, now: NOW },
});

const goodQuick = {
  client_id: "client-0001",
  mode: "quick",
  title: "Unless, even if, provided…",
  total_items: 10,
  correct: 8,
  wrong_items: [4, 7],
  tags: [{ n: 4, tag_key: "cau-dieu-kien-dao-ngu" }],
  context: "home",
  attempt: "first",
  used_hint: false,
  taken_on: "2026-10-16",
};
const goodFrame = { client_id: "client-0002", mode: "frame", frame_id: FRAME, wrong_items: [3, 9], context: "class", attempt: "first", used_hint: false, taken_on: "2026-10-16" };
const goodNote = { client_id: "client-0003", session_date: "2026-10-16", studied: "Unit 7", weak_tags: ["dang-tu"], message: "Ôn dạng từ", rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }] };

const destination = frameFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content", "frames", "destination-c1-c2-progress-test-u1-12.json"), "utf8")));
const frameView = (): FrameView => {
  const n = normalizeFrame(destination);
  return { id: FRAME, title: n.title, totalItems: n.total, parts: n.parts, items: n.items.map((i) => ({ n: i.n, part: i.part, tagKey: i.tag_key })), scale: n.scale };
};

describe("S5b-1 frame scoring (the grid on 'Ghi kết quả bài')", () => {
  it("no wrong item = full marks, every part full, no tag groups, top band", () => {
    const f = frameView();
    const s = scoreFrame(f, new Set());
    expect(s.correct).toBe(60);
    expect(s.wrong).toEqual([]);
    expect(s.parts.every((p) => p.correct === p.total)).toBe(true);
    expect(s.parts.reduce((a, p) => a + p.total, 0)).toBe(60);
    expect(s.tags).toEqual([]);
    expect(scaleBand(f.scale, s.correct)).toBe("Rất tốt");
  });

  it("wrong items lower the total and their part, are grouped by the tag of the FRAME, and move the band", () => {
    const f = frameView();
    const wrong = new Set([1, 2, 13, 54, 55, 56, 57, 58, 59, 60]);
    const s = scoreFrame(f, wrong);
    expect(s.correct).toBe(50);
    expect(s.wrong).toEqual([1, 2, 13, 54, 55, 56, 57, 58, 59, 60]);
    const right = Object.fromEntries(s.parts.map((p) => [p.key, p.correct]));
    expect(right).toMatchObject({ A: 10, B: 9, G: 0 });
    expect(scaleBand(f.scale, s.correct)).toBe("Tốt");
    // every wrong item is in exactly one tag group, and the group matches the frame
    expect(s.tags.flatMap((t) => t.items).sort((a, b) => a - b)).toEqual(s.wrong);
    for (const t of s.tags) for (const n of t.items) expect(f.items.find((i) => i.n === n)?.tagKey).toBe(t.tagKey);
  });

  it("all wrong = 0 and the lowest band; numbers outside the frame are ignored", () => {
    const f = frameView();
    const s = scoreFrame(f, new Set(Array.from({ length: 80 }, (_, i) => i + 1)));
    expect(s.correct).toBe(0);
    expect(s.wrong).toHaveLength(60);
    expect(scaleBand(f.scale, s.correct)).toBe("Cần ôn kỹ");
  });

  it("itemList sorts and joins", () => {
    expect(itemList([9, 3, 5])).toBe("3, 5, 9");
  });
});

describe("S5b-1 quick entry helpers", () => {
  it("parses wrong item numbers: commas, spaces, semicolons; sorted and unique", () => {
    expect(parseItemNumbers("7, 4 7;12", 20)).toEqual({ ok: true, items: [4, 7, 12] });
    expect(parseItemNumbers("", 20)).toEqual({ ok: true, items: [] });
  });
  it("refuses anything that is not a whole number inside 1..total", () => {
    expect(parseItemNumbers("0", 20)).toEqual({ ok: false });
    expect(parseItemNumbers("21", 20)).toEqual({ ok: false });
    expect(parseItemNumbers("3, a", 20)).toEqual({ ok: false });
    expect(parseItemNumbers("2.5", 20)).toEqual({ ok: false });
    expect(parseItemNumbers("-1", 20)).toEqual({ ok: false });
  });
  it("makes the key of a family tag from its label (no accents, x- prefix, matches the SQL check)", () => {
    expect(customTagKey("Đảo ngữ với 'hardly'")).toBe("x-dao-ngu-voi-hardly");
    expect(customTagKey("  Cụm từ cố định  ")).toBe("x-cum-tu-co-dinh");
    expect(customTagKey("!!!")).toBeNull();
    const long = customTagKey("a".repeat(200));
    expect(long?.length).toBeLessThanOrEqual(46); // the database adds "-" and 5 random characters (≤ 58 in all)
    expect(long).toMatch(/^x-[a-z0-9][a-z0-9-]{0,44}$/);
  });
});

describe("S5b-1 request bodies", () => {
  it("accepts a good quick result and a good framed result", () => {
    expect(resultBodySchema.safeParse(goodQuick).success).toBe(true);
    expect(resultBodySchema.safeParse(goodFrame).success).toBe(true);
  });
  it("a framed result needs a frame and takes no tags; a quick result takes no frame", () => {
    expect(resultBodySchema.safeParse({ ...goodFrame, frame_id: undefined }).success).toBe(false);
    expect(resultBodySchema.safeParse({ ...goodFrame, tags: [{ n: 3, tag_key: "dang-tu" }] }).success).toBe(false);
    expect(resultBodySchema.safeParse({ ...goodQuick, frame_id: FRAME }).success).toBe(false);
  });
  it("refuses unknown fields, bad dates and bad enums (strict)", () => {
    expect(resultBodySchema.safeParse({ ...goodQuick, recorded_by: "x" }).success).toBe(false);
    expect(resultBodySchema.safeParse({ ...goodQuick, taken_on: "2026-02-30" }).success).toBe(false);
    expect(resultBodySchema.safeParse({ ...goodQuick, attempt: "third" }).success).toBe(false);
    expect(resultBodySchema.safeParse({ ...goodQuick, context: "school" }).success).toBe(false);
  });
  it("session note limits: 3 tags, 500 / 1000 characters, each recheck tag once", () => {
    expect(sessionNoteBodySchema.safeParse(goodNote).success).toBe(true);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, weak_tags: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, message: "x".repeat(501) }).success).toBe(false);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, message: "x".repeat(500) }).success).toBe(true);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, note_for_parent: "x".repeat(1001) }).success).toBe(false);
    expect(
      sessionNoteBodySchema.safeParse({ ...goodNote, rechecks: [{ tag_key: "dang-tu", result: "ok" }, { tag_key: "dang-tu", result: "still_wrong" }] }).success,
    ).toBe(false);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, rechecks: [{ tag_key: "dang-tu", result: "maybe" }] }).success).toBe(false);
  });
  it("session note: practised skills are optional, at most 30, and reach the store", async () => {
    expect(sessionNoteBodySchema.parse(goodNote).practised_target_ids).toEqual([]);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, practised_target_ids: ["B-W-1", "B-A3-REVISE"] }).success).toBe(true);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, practised_target_ids: Array.from({ length: 31 }, (_, i) => `T-${i}`) }).success).toBe(false);
    expect(sessionNoteBodySchema.safeParse({ ...goodNote, practised_target_ids: [""] }).success).toBe(false);
    const s = makeStore();
    const r = await handleWriteSessionNote(deps("tutorAn", s), AN, { ...goodNote, practised_target_ids: ["A-W-1"] });
    expect(r.status).toBe(201);
    expect(s.writeSessionNote).toHaveBeenCalledWith(expect.objectContaining({ practisedTargetIds: ["A-W-1"] }));
  });
  it("tags for writing: 1..3; tagging wrong items needs at least one", () => {
    expect(writingTagsBodySchema.safeParse({ tags: ["a", "b", "c"] }).success).toBe(true);
    expect(writingTagsBodySchema.safeParse({ tags: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(writingTagsBodySchema.safeParse({ tags: [] }).success).toBe(false);
    expect(tagItemsBodySchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("S5b-1 handlers: 401 / 404 / 403 come before anything else", () => {
  const all = (d: TutorWorkDeps) => [
    () => handleRecordResult(d, AN, goodQuick),
    () => handleTagResultItems(d, RESULT_AN, { items: [{ n: 4, tag_key: "dang-tu" }] }),
    () => handleAddTag(d, AN, { label: "Đảo ngữ", group_key: "gr-emphasis" }),
    () => handleTagEpisode(d, EPISODE_AN, { tags: ["dang-tu"] }),
    () => handleWriteSessionNote(d, AN, goodNote),
    () => handleSetTagGroup(d, AN, { tag_key: "x-cu-abcde", group_key: "wr-genre" }),
  ];
  const writes = (s: ReturnType<typeof makeStore>) => [s.recordResult, s.tagResultItems, s.addTag, s.tagEpisode, s.writeSessionNote, s.setTagGroup];

  it("401 without a session, store untouched", async () => {
    const s = makeStore();
    const out = await Promise.all(all(deps(null, s)).map((f) => f()));
    expect(out.map((r) => r.status)).toEqual(Array(6).fill(401));
    for (const fn of writes(s)) expect(fn).not.toHaveBeenCalled();
  });

  it("a student gets 403 everywhere and never reaches the store", async () => {
    const s = makeStore();
    const out = await Promise.all(all(deps("studentAn", s)).map((f) => f()));
    expect(out.map((r) => r.status)).toEqual(Array(6).fill(403));
    for (const fn of writes(s)) expect(fn).not.toHaveBeenCalled();
  });

  it("the other child's tutor gets 404 (never 403) and nothing is written", async () => {
    const s = makeStore();
    const out = await Promise.all(all(deps("tutorNguyen", s)).map((f) => f()));
    expect(out.map((r) => r.status)).toEqual(Array(6).fill(404));
    for (const fn of writes(s)) expect(fn).not.toHaveBeenCalled();
  });

  it("unknown or malformed ids are 404", async () => {
    const s = makeStore();
    expect((await handleTagResultItems(deps("parent", s), "not-a-uuid", { items: [{ n: 1, tag_key: "x" }] })).status).toBe(404);
    expect((await handleTagResultItems(deps("parent", s), "99999999-9999-4999-8999-999999999999", { items: [{ n: 1, tag_key: "x" }] })).status).toBe(404);
    expect((await handleTagEpisode(deps("parent", s), "99999999-9999-4999-8999-999999999999", { tags: ["x"] })).status).toBe(404);
    expect(s.tagResultItems).not.toHaveBeenCalled();
  });

  it("real children are 404 on a preview", async () => {
    const real: Learner = { id: "c0000000-0000-4000-8000-000000000009", familyId: FAMILY, memberId: null, alias: "Real", trackId: "A", isTest: false, status: "active" };
    const store: AccessStore = { ...access, getLearner: async (id) => (id === real.id ? real : null) };
    const s = makeStore();
    const d: TutorWorkDeps = { user: { id: "u-parent" }, store: s, access: { store, allowRealLearners: false, now: NOW } };
    expect((await handleRecordResult(d, real.id, goodQuick)).status).toBe(404);
    expect(s.recordResult).not.toHaveBeenCalled();
  });
});

describe("S5b-1 handlers: writes", () => {
  it("tutor and parent may record a result; the actor comes from the session, never from the body", async () => {
    for (const who of ["tutorAn", "parent"]) {
      const s = makeStore();
      const r = await handleRecordResult(deps(who, s), AN, goodQuick);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: "r1", replayed: false, untagged: 2 });
      expect(s.recordResult).toHaveBeenCalledWith(
        expect.objectContaining({ learnerId: AN, byMemberId: `m-${who}`, mode: "quick", wrong: [4, 7], tags: [{ n: 4, tag_key: "cau-dieu-kien-dao-ngu" }], usedHint: false, attempt: "first" }),
      );
    }
  });

  it("a result can name the assignment it is about (a uuid, passed on); without one it is null; a bad id is 400", async () => {
    const ASSIGNMENT = "c0000000-0000-4000-8000-000000000001";
    const s = makeStore();
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodQuick, assignment_id: ASSIGNMENT })).status).toBe(201);
    expect(s.recordResult).toHaveBeenLastCalledWith(expect.objectContaining({ assignmentId: ASSIGNMENT }));
    await handleRecordResult(deps("tutorAn", s), AN, goodQuick);
    expect(s.recordResult).toHaveBeenLastCalledWith(expect.objectContaining({ assignmentId: null }));
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodQuick, assignment_id: "x" })).status).toBe(400);
  });

  it("a bad body is 400 and the store is not touched; a replay is 200", async () => {
    const s = makeStore();
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodQuick, wrong_items: "4,7" })).status).toBe(400);
    expect(s.recordResult).not.toHaveBeenCalled();
    const replay = makeStore({ recordResult: vi.fn(async () => ({ id: "r1", replayed: true, untagged: 0 })) });
    expect((await handleRecordResult(deps("tutorAn", replay), AN, goodQuick)).status).toBe(200);
  });

  it("work done in the session by a parent: the database says D15 and the answer is 403 tutor_only", async () => {
    const s = makeStore({
      recordResult: vi.fn(async () => {
        throw new ReviewDbError("42501", "eng_record_result: only a tutor may record work done in the session (D15)");
      }),
    });
    const r = await handleRecordResult(deps("parent", s), AN, goodFrame);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "tutor_only" });
    expect(JSON.stringify(r.body)).not.toContain("eng_record_result");
  });

  it("database errors become friendly codes: 23514/22023 → 400, 23505 → 409, P0002 → 404; unknown ones are rethrown", async () => {
    const run = async (code: string) => {
      const s = makeStore({
        recordResult: vi.fn(async () => {
          throw new ReviewDbError(code, "x");
        }),
      });
      return handleRecordResult(deps("tutorAn", s), AN, goodQuick);
    };
    expect((await run("23514")).status).toBe(400);
    expect((await run("22023")).status).toBe(400);
    expect((await run("23505")).status).toBe(409);
    expect((await run("P0002")).status).toBe(404);
    await expect(run("XX000")).rejects.toBeInstanceOf(ReviewDbError);
  });

  it("a Studio frame of another child is 400 frame_other_learner, with a Vietnamese sentence and no database text", async () => {
    const s = makeStore({
      recordResult: vi.fn(async () => {
        throw new ReviewDbError("23514", "results: this frame belongs to another learner (frame_other_learner)");
      }),
    });
    const r = await handleRecordResult(deps("tutorAn", s), AN, goodFrame);
    expect(r).toMatchObject({ status: 400, body: { error: "frame_other_learner" } });
    expect(JSON.stringify(r.body)).not.toContain("results:");
    expect(failText({ ok: false, status: 400, error: "frame_other_learner" } as never)).toBe(tutorWorkErrors.frameOtherLearner);
  });

  it("a second first attempt of the same test is 409 duplicate_first (its own code, no database text)", async () => {
    const s = makeStore({
      recordResult: vi.fn(async () => {
        throw new ReviewDbError("23505", "eng_record_result: this test already has a first attempt (duplicate_first)");
      }),
    });
    const r = await handleRecordResult(deps("tutorAn", s), AN, goodFrame);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "duplicate_first" });
    expect(JSON.stringify(r.body)).not.toContain("eng_record_result");
    // any other 23505 stays the generic conflict
    const other = makeStore({
      recordResult: vi.fn(async () => {
        throw new ReviewDbError("23505", "eng_record_result: that result was already replaced");
      }),
    });
    expect((await handleRecordResult(deps("tutorAn", other), AN, goodQuick)).body).toMatchObject({ error: "conflict" });
  });

  it("the choice 'Bài kiểm tra / Bài luyện' of a quick result is passed on; a framed result takes none but 'test'", async () => {
    const s = makeStore();
    await handleRecordResult(deps("tutorAn", s), AN, { ...goodQuick, source: "test" });
    expect(s.recordResult).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "quick", source: "test" }));
    await handleRecordResult(deps("tutorAn", s), AN, goodQuick);
    expect(s.recordResult).toHaveBeenLastCalledWith(expect.objectContaining({ source: null }));
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodQuick, source: "exam" })).status).toBe(400);
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodFrame, source: "practice" })).status).toBe(400);
    expect((await handleRecordResult(deps("tutorAn", s), AN, { ...goodFrame, source: "test" })).status).toBe(201);
  });

  it("'+ nhãn khác': the key is made on the server from the label, and a group of the skill map is required", async () => {
    const s = makeStore();
    const r = await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ với hardly", group_key: "gr-emphasis" });
    expect(r).toEqual({ status: 201, body: { key: "x-dao-ngu-voi-hardly", label: "Đảo ngữ với hardly", group_key: "gr-emphasis", created: true } });
    expect(s.addTag).toHaveBeenCalledWith({ learnerId: AN, key: "x-dao-ngu-voi-hardly", label: "Đảo ngữ với hardly", groupKey: "gr-emphasis", byMemberId: "m-tutorAn" });
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "?!?!", group_key: "gr-emphasis" })).status).toBe(400);
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ" })).status).toBe(400); // no group
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ", group_key: "Ngữ pháp" })).status).toBe(400); // not a group key
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "x", key: "x-evil", group_key: "gr-emphasis" })).status).toBe(400);
    const existing = makeStore({ addTag: vi.fn(async () => ({ key: "dang-tu", label_vi: "Dạng từ", group_key: null, created: false })) });
    expect(await handleAddTag(deps("tutorAn", existing), AN, { label: "Dạng từ", group_key: "vo-word-form" })).toEqual({
      status: 200, body: { key: "dang-tu", label: "Dạng từ", group_key: null, created: false },
    });
    const unknown = makeStore({ addTag: vi.fn(async () => { throw new ReviewDbError("23514", "eng_add_error_tag_v2: x (unknown_group)"); }) });
    expect(await handleAddTag(deps("tutorAn", unknown), AN, { label: "Mới", group_key: "gr-nope" })).toMatchObject({ status: 400, body: { error: "unknown_group" } });
  });

  it("'Xếp vào nhóm': staff of the child group an old family tag; database answers are mapped", async () => {
    const s = makeStore();
    expect(await handleSetTagGroup(deps("parent", s), AN, { tag_key: "x-cu-abcde", group_key: "wr-sentence-mech" })).toEqual({
      status: 200, body: { key: "x-cu-abcde", group_key: "wr-sentence-mech", changed: true },
    });
    expect(s.setTagGroup).toHaveBeenCalledWith({ learnerId: AN, tagKey: "x-cu-abcde", groupKey: "wr-sentence-mech", byMemberId: "m-parent" });
    expect((await handleSetTagGroup(deps("tutorAn", s), AN, { tag_key: "x-cu-abcde" })).status).toBe(400);
    expect((await handleSetTagGroup(deps("tutorAn", s), AN, { tag_key: "dang-tu", group_key: "gr-tense" })).status).toBe(400); // seed tags are grouped by the map
    const grouped = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("23514", "eng_set_tag_group: x (already_grouped)"); }) });
    expect(await handleSetTagGroup(deps("tutorAn", grouped), AN, { tag_key: "x-cu-abcde", group_key: "wr-genre" })).toMatchObject({ status: 409, body: { error: "already_grouped" } });
    const unknown = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("23514", "eng_set_tag_group: x (unknown_group)"); }) });
    expect(await handleSetTagGroup(deps("tutorAn", unknown), AN, { tag_key: "x-cu-abcde", group_key: "gr-nope" })).toMatchObject({ status: 400, body: { error: "unknown_group" } });
    const missing = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("P0002", "eng_set_tag_group: no family tag"); }) });
    expect((await handleSetTagGroup(deps("tutorAn", missing), AN, { tag_key: "x-nope-abcde", group_key: "wr-genre" })).status).toBe(404);
  });

  it("tags read from the database carry the group of a family tag; the form words the two new errors", () => {
    expect(parseTags([
      { key: "dang-tu", label_vi: "Dạng từ", group_vi: "Từ vựng", origin: "seed", group_key: null },
      { key: "x-moi-abcde", label_vi: "Mới", group_vi: "Nhãn riêng", origin: "custom", group_key: "gr-emphasis" },
    ])).toEqual([
      { key: "dang-tu", label: "Dạng từ", group: "Từ vựng", custom: false, groupKey: null },
      { key: "x-moi-abcde", label: "Mới", group: "Nhãn riêng", custom: true, groupKey: "gr-emphasis" },
    ]);
    expect(failText({ ok: false, status: 400, error: "unknown_group" })).toBe(tutorWorkErrors.unknownGroup);
    expect(failText({ ok: false, status: 409, error: "already_grouped" })).toBe(tutorWorkErrors.alreadyGrouped);
  });

  it("tags for wrong items and for writing use the result's / episode's learner for the access check", async () => {
    const s = makeStore();
    const t = await handleTagResultItems(deps("parent", s), RESULT_AN, { items: [{ n: 4, tag_key: "dang-tu" }] });
    expect(t.status).toBe(201);
    expect(s.tagResultItems).toHaveBeenCalledWith({ resultId: RESULT_AN, items: [{ n: 4, tag_key: "dang-tu" }], byMemberId: "m-parent" });
    const w = await handleTagEpisode(deps("tutorAn", s), EPISODE_AN, { tags: ["dang-tu", "phat-am"] });
    expect(w.status).toBe(201);
    expect(s.tagEpisode).toHaveBeenCalledWith({ episodeId: EPISODE_AN, tags: ["dang-tu", "phat-am"], byMemberId: "m-tutorAn" });
    expect((await handleTagEpisode(deps("tutorAn", s), EPISODE_AN, { tags: ["a", "b", "c", "d"] })).status).toBe(400);
  });

  it("a session note passes through every field and the author is the signed-in member (tutor or parent)", async () => {
    for (const who of ["tutorAn", "parent"]) {
      const s = makeStore();
      const r = await handleWriteSessionNote(deps(who, s), AN, { ...goodNote, note_for_parent: "Em tiến bộ" });
      expect(r.status).toBe(201);
      expect(s.writeSessionNote).toHaveBeenCalledWith({
        learnerId: AN, sessionDate: "2026-10-16", studied: "Unit 7", weakTags: ["dang-tu"], message: "Ôn dạng từ", noteForParent: "Em tiến bộ",
        rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }], practisedTargetIds: [], supersedes: null, byMemberId: `m-${who}`, clientId: "client-0003", taughtUnits: [],
      });
    }
  });
});

describe("S5b-1 parsing what the database returns", () => {
  const weakRaw = {
    policy_days: 14,
    since: null,
    today: "2026-10-17",
    tags: [
      {
        tag_key: "cau-dieu-kien-dao-ngu", label_vi: "Câu điều kiện & đảo ngữ", group_vi: "Ngữ pháp", sources: 3,
        by_source: { test: 1, practice: 0, lesson: 1, writing: 1 }, items_wrong: { test: 4, practice: 0 }, asked_correct: { asked: 8, wrong: 4 },
        last_seen: "2026-10-16", recheck_due_on: "2026-10-30", recheck_due: false, last_recheck: null, status: "repeat",
        events: [{ date: "2026-10-16", source: "test", source_id: "s1", items: [4, 5], title: "Destination", used_hint: false, in_class: true, extra: "dropped" }],
      },
    ],
  };
  it("weak points: camelCase, unknown keys dropped, odd shapes throw instead of showing half a page", () => {
    const v = parseWeakPoints(weakRaw);
    expect(v.policyDays).toBe(14);
    expect(v.tags[0]).toMatchObject({ tagKey: "cau-dieu-kien-dao-ngu", sources: 3, status: "repeat", askedWrong: 4, recheckDue: false });
    expect(v.tags[0]?.events[0]).not.toHaveProperty("extra");
    expect(() => parseWeakPoints({ ...weakRaw, tags: [{ ...weakRaw.tags[0], status: "unknown" }] })).toThrow();
  });
  it("untagged queue: empty or null is an empty list", () => {
    expect(parseUntagged(null)).toEqual([]);
    expect(parseUntagged({ items: [] })).toEqual([]);
    const [one] = parseUntagged({ items: [{ result_id: "r1", recorded_by_member: "m1", recorded_role: "parent", title: "T", taken_on: "2026-10-10", created_at: "2026-10-10T01:00:00Z", source: "practice", used_hint: true, in_class: false, items: [4, 7] }] });
    expect(one).toMatchObject({ resultId: "r1", items: [4, 7], usedHint: true, source: "practice" });
  });
  it("notes written with 'Ghi buổi học' (no support level, new columns) parse; old notes still do", () => {
    const base = { id: "n1", learner_id: AN, tutor_member_id: "m1", session_date: "2026-10-16", goals: "Unit 7", observed: null, next_actions: [], practised_target_ids: [], published: true, supersedes_id: null, created_at: "2026-10-16T09:00:00Z" };
    const [v2, v1] = parseNotes([
      { ...base, support_level: null, weak_tag_keys: ["dang-tu"], message_to_learner: "Ôn nhé", note_for_parent: "Ổn", author_role: "parent" },
      { ...base, id: "n0", session_date: "2026-10-01", support_level: "light" },
    ]);
    expect(v2).toMatchObject({ supportLevel: null, weakTagKeys: ["dang-tu"], messageToLearner: "Ôn nhé", noteForParent: "Ổn", authorRole: "parent" });
    expect(v1).toMatchObject({ supportLevel: "light", weakTagKeys: [], messageToLearner: null, authorRole: "tutor" });
  });
  it("last note: the newest row", () => {
    expect(parseLastNote([])).toBeNull();
    expect(parseLastNote([{ id: "n1", session_date: "2026-10-16", goals: null, weak_tag_keys: ["dang-tu"], message_to_learner: null, author_role: null }])).toMatchObject({
      id: "n1", weakTagKeys: ["dang-tu"], authorRole: "tutor", practisedTargetIds: [],
    });
    expect(parseLastNote([{ id: "n2", session_date: "2026-10-16", goals: null, weak_tag_keys: [], practised_target_ids: ["B-W-1"], message_to_learner: null, author_role: "tutor" }])?.practisedTargetIds).toEqual(["B-W-1"]);
    expect(parseLastNote([{ id: "n3", session_date: "2026-10-16", goals: null, weak_tag_keys: [], practised_target_ids: null, message_to_learner: null, author_role: "tutor" }])?.practisedTargetIds).toEqual([]);
  });
});

describe("S5b-1 window and parent wait", () => {
  it("4 and 8 weeks start that many days back; 'all' has no start", () => {
    expect(windowSince("4", "2026-10-17")).toBe("2026-09-19");
    expect(windowSince("8", "2026-10-17")).toBe("2026-08-22");
    expect(windowSince("all", "2026-10-17")).toBeNull();
  });
  const item = (id: string, createdAt: string, by = "m-tutorNguyen"): UntaggedItem => ({
    resultId: id, recordedByMember: by, recordedRole: by === "m-parent" ? "parent" : "tutor", title: id, takenOn: "2026-10-10", createdAt, source: "practice", usedHint: false, inClass: false, items: [1],
  });
  const tutor = { role: "tutor", memberId: "m-tutorNguyen" } as const;
  const parent = { role: "parent", memberId: "m-parent" } as const;
  it("the tutor sees every untagged item; the parent only those older than 2 days (waiting for the tutor first)", () => {
    const items = [item("today", "2026-10-17T01:00:00Z"), item("yesterday", "2026-10-16T01:00:00Z"), item("two-days", "2026-10-15T01:00:00Z"), item("old", "2026-10-01T01:00:00Z")];
    expect(filterUntagged(items, tutor, NOW).map((i) => i.resultId)).toEqual(["today", "yesterday", "two-days", "old"]);
    expect(filterUntagged(items, parent, NOW).map((i) => i.resultId)).toEqual(["two-days", "old"]);
  });
  it("the parent sees what she recorded herself at once (the wait is only for the tutor's items), and they are marked as hers", () => {
    const items = [item("mine-today", "2026-10-17T01:00:00Z", "m-parent"), item("tutor-today", "2026-10-17T01:00:00Z"), item("mine-old", "2026-10-01T01:00:00Z", "m-parent")];
    const seen = filterUntagged(items, parent, NOW);
    expect(seen.map((i) => [i.resultId, i.own])).toEqual([["mine-today", true], ["mine-old", true]]);
    expect(filterUntagged(items, tutor, NOW).map((i) => [i.resultId, i.own])).toEqual([["mine-today", false], ["tutor-today", true], ["mine-old", false]]);
  });
  it("the day is counted in Vietnam time (an item made at 20:00 UTC is already the next day there)", () => {
    const late = item("late", "2026-10-14T20:00:00Z"); // 15/10 03:00 in Vietnam → 2 days before 17/10
    expect(filterUntagged([late], parent, NOW)).toHaveLength(1);
    const notYet = item("not-yet", "2026-10-15T20:00:00Z"); // 16/10 03:00 in Vietnam → 1 day
    expect(filterUntagged([notYet], parent, NOW)).toHaveLength(0);
  });
});
