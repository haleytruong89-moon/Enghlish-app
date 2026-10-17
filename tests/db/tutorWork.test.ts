import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTENT_DIR } from "../../lib/config/content";
import { parseNotes } from "../../lib/review/shape";
import { customTagKey } from "../../lib/tutorwork/frameScore";
import { parseFrames, parseLastNote, parseRecentResult, parseTags, parseUntagged, parseWeakPoints } from "../../lib/tutorwork/shape";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { asCommit, createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const daysAgo = (n: number) => addDays(TODAY, -n);

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}

type WeakTag = {
  tag_key: string;
  label_vi: string;
  sources: number;
  by_source: { test: number; practice: number; lesson: number; writing: number };
  items_wrong: { test: number; practice: number };
  asked_correct: { asked: number; wrong: number };
  last_seen: string | null;
  recheck_due_on: string | null;
  recheck_due: boolean;
  last_recheck: { result: string } | null;
  status: "repeat" | "watch" | "ok";
  events: { date: string; source: string; source_id: string; items: number[]; title: string | null; used_hint: boolean; in_class: boolean }[];
};
type Weak = { policy_days: number | null; since: string | null; today: string; tags: WeakTag[] };
type Queue = { items: { result_id: string; title: string; items: number[]; source: string; created_at: string }[] };

// A tiny Track B frame (10 items) and Track A frame, written directly by the owner (the import script does the same).
type FrameJson = { title: string; total: number; parts: unknown[]; items: { n: number; part: string; tag_key: string }[]; scale: unknown[] | null };
const frameB = (over: Partial<FrameJson> = {}): FrameJson => ({
  title: "Tiny B test",
  total: 10,
  parts: [
    { key: "A", name: "Grammar", from: 1, to: 5 },
    { key: "B", name: "Words", from: 6, to: 10 },
  ],
  items: [
    ...[1, 2, 3].map((n) => ({ n, part: "A", tag_key: "cau-dieu-kien-dao-ngu" })),
    ...[4, 5].map((n) => ({ n, part: "A", tag_key: "wish-would-rather" })),
    ...[6, 7, 8].map((n) => ({ n, part: "B", tag_key: "dang-tu" })),
    ...[9, 10].map((n) => ({ n, part: "B", tag_key: "cum-dong-tu" })),
  ],
  scale: [
    { min: 8, max: 10, label: "Tốt" },
    { min: 0, max: 7, label: "Cần ôn" },
  ],
  ...over,
});

describe("S5b-1 PR A: results, tag marks, weak points, lesson note v2 (migrations 0014 + 0015)", () => {
  let db: TestDb;
  let s: Seeded;
  let parent2User: string;
  let parent2Member: string;
  let family2: string;
  let learner2: string;
  let frameId: string;
  let menhKey = ""; // key of the first custom tag (made by the database)
  let r1: string;
  let b0: string;
  let ep6: string;
  let ep3: string;
  let ep11: string;
  let epB5: string;
  const M = () => s.members;
  const AN = () => s.learners.an;
  const NG = () => s.learners.nguyen;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  let reqSeq = 0;
  async function assign(who: "an" | "nguyen", templateId: string, due: string): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who], templateId, due, s.members.parent, `s5b-test-${(reqSeq += 1)}-${templateId}`,
    ]);
    return (r[0] as { id: string }).id;
  }
  const activity = async (instance: string, stepNo: number) =>
    ((await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0] as { id: string }).id;
  const episodeOf = async (attemptId: string) =>
    ((await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [attemptId]))[0] as { id: string }).id;
  const submitAs = (userId: string, activityId: string, content: unknown) =>
    asCommit(db.client, "authenticated", userId, async (q) => {
      const r = await q("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activityId, randomUUID(), JSON.stringify(content), ["none"]]);
      return (r.rows[0] as { r: { attempt_id: string } }).r;
    });

  async function insertFrame(learnerFamily: string, track: string, f: FrameJson, supersedes: string | null = null): Promise<string> {
    const r = await db.client.query<{ id: string }>(
      `insert into english.test_frames(family_id, track_id, title, total_items, parts, items, scale, supersedes_id)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8) returning id`,
      [learnerFamily, track, f.title, f.total, JSON.stringify(f.parts), JSON.stringify(f.items), f.scale === null ? null : JSON.stringify(f.scale), supersedes],
    );
    return (r.rows[0] as { id: string }).id;
  }

  type Res = { id: string; replayed: boolean; untagged: number };
  type ResultOpts = {
    mode?: "frame" | "quick";
    frame?: string | null;
    title?: string | null;
    total?: number | null;
    correct?: number | null;
    wrong?: number[];
    tags?: { n: number; tag_key: string | null }[] | null;
    context?: "home" | "class";
    attempt?: "first" | "retry";
    hint?: boolean;
    on?: string;
    supersedes?: string | null;
    clientId?: string;
    learner?: string;
    source?: "test" | "practice" | null;
  };
  // A framed first attempt can be recorded once per test (and learner), so each default call gets its own frame (same items and tags).
  let frameSeq = 0;
  const freshFrame = () => insertFrame(s.familyId, "B", frameB({ title: `Tiny B test #${(frameSeq += 1)}` }));
  const record = async (by: string, o: ResultOpts = {}) => {
    const frame = o.frame === undefined ? await freshFrame() : o.frame;
    return svc<Res>("select english.eng_record_result($1, $2, $3, $4, $5, $6, $7::int[], $8::jsonb, $9, $10, $11, $12::date, null, $13, $14, $15, $16) as r", [
      o.learner ?? NG(), o.mode ?? "frame", frame, o.title ?? null, o.total ?? null, o.correct ?? null,
      o.wrong ?? [], o.tags === undefined || o.tags === null ? null : JSON.stringify(o.tags), o.context ?? "home", o.attempt ?? "first", o.hint ?? false,
      o.on ?? TODAY, o.supersedes ?? null, by, o.clientId ?? randomUUID(), o.source ?? null,
    ]);
  };
  const quick = (by: string, o: ResultOpts = {}) =>
    record(by, { mode: "quick", frame: null, title: "Link practice", total: 10, correct: 8, wrong: [4, 7], ...o });
  const weak = (learner: string, since: string | null = null) =>
    svc<Weak>("select english.eng_weak_points($1, $2::date) as r", [learner, since]);
  const tagOf = (w: Weak, key: string) => w.tags.find((t) => t.tag_key === key);
  const queue = (learner: string) => svc<Queue>("select english.eng_untagged_queue($1) as r", [learner]);
  const tagItems = (by: string, result: string, items: { n: number; tag_key: string }[]) =>
    svc<{ tagged: number; replayed: boolean }>("select english.eng_tag_result_items($1, $2::jsonb, $3) as r", [result, JSON.stringify(items), by]);
  type NoteRes = { id: string; replayed: boolean };
  const noteV2 = (by: string, o: { learner?: string; date?: string; studied?: string | null; weak?: string[]; message?: string | null; parent?: string | null; rechecks?: { tag_key: string; result: string }[]; supersedes?: string | null; clientId?: string } = {}) =>
    svc<NoteRes>("select english.eng_write_lesson_note_v2($1, $2::date, $3, $4::text[], $5, $6, $7::jsonb, $8, $9, $10) as r", [
      o.learner ?? NG(), o.date ?? TODAY, o.studied === undefined ? "Unit 13" : o.studied, o.weak ?? [], o.message === undefined ? null : o.message,
      o.parent === undefined ? null : o.parent, JSON.stringify(o.rechecks ?? []), o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const tagEpisode = (by: string, episode: string, tags: string[]) =>
    svc<{ added: number; replayed: boolean }>("select english.eng_tag_episode($1, $2::text[], $3) as r", [episode, tags, by]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    parent2User = await createAuthUser(db.client, "parent2@test.local");
    family2 = ((await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0] as { id: string }).id;
    parent2Member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, family2]))[0] as { id: string }).id;
    learner2 = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Other child', 'B', true, 'active') returning id", [family2]))[0] as { id: string }).id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [parent2Member, learner2]);

    frameId = await insertFrame(s.familyId, "B", frameB());

    r1 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    b0 = await assign("nguyen", "B-W0-BASELINE", dueReleasingAll("B-W0-BASELINE"));
    ep6 = await episodeOf((await submitAs(s.users.studentAn, await activity(r1, 6), { text: "Volcanoes erupt because the magma rises." })).attempt_id);
    ep3 = await episodeOf((await submitAs(s.users.studentAn, await activity(r1, 3), { answers: { "W1-R7": "Probably not." } })).attempt_id);
    ep11 = await episodeOf((await submitAs(s.users.studentAn, await activity(r1, 11), { text: "Some volcanoes explode because their magma is thick." })).attempt_id);
    epB5 = await episodeOf((await submitAs(s.users.studentNguyen, await activity(b0, 5), { text: "Although the policy sounds fair, it has hidden costs." })).attempt_id);
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("seed tags (0015)", () => {
    it("10 tags per track, global, none retired; keys never start with x-", async () => {
      expect(await count("select count(*)::int as n from english.error_tags where track_id = 'A' and origin = 'seed' and family_id is null and retired_at is null")).toBe(10);
      expect(await count("select count(*)::int as n from english.error_tags where track_id = 'B' and origin = 'seed' and family_id is null and retired_at is null")).toBe(10);
      expect(await count("select count(*)::int as n from english.error_tags where key like 'x-%' and origin = 'seed'")).toBe(0);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("frame validation (items cover 1..N once, tags exist for the track)", () => {
    const tryFrame = (f: FrameJson, track = "B") => insertFrame(s.familyId, track, f);
    const bad = async (f: FrameJson, re: RegExp, track = "B") => {
      const err = await tryFrame(f, track).then(() => null, (e: unknown) => e as { code?: string; message?: string });
      expect(err, "expected the frame to be refused").not.toBeNull();
      expect(err?.code).toBe("23514");
      expect(err?.message).toMatch(re);
    };
    const base = frameB();

    it("accepts the valid frame and keeps no question text (only item number, part, tag)", async () => {
      const f = (await q1<{ items: { n: number; part: string; tag_key: string }[] }>("select items from english.test_frames where id = $1", [frameId]))[0];
      expect(f?.items).toHaveLength(10);
      for (const it of f?.items ?? []) expect(Object.keys(it).sort()).toEqual(["n", "part", "tag_key"]);
    });

    it("refuses a frame that skips, repeats or misnumbers an item", async () => {
      await bad(frameB({ items: base.items.slice(0, 9) }), /exactly once/);
      await bad(frameB({ items: [...base.items.slice(0, 9), { n: 9, part: "B", tag_key: "cum-dong-tu" }] }), /exactly once/);
      await bad(frameB({ items: [...base.items.slice(0, 9), { n: 11, part: "B", tag_key: "cum-dong-tu" }] }), /exactly once|range/);
      await bad(frameB({ total: 11 }), /exactly once/);
    });

    it("refuses an item outside its part, an unknown part, overlapping parts and broken part ranges", async () => {
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, part: "B" } : i)) }), /range contains/);
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, part: "Z" } : i)) }), /range contains/);
      await bad(frameB({ parts: [{ key: "A", name: "Grammar", from: 1, to: 6 }, { key: "B", name: "Words", from: 6, to: 10 }] }), /overlap/);
      await bad(frameB({ parts: [{ key: "A", name: "Grammar", from: 1, to: 5 }, { key: "A", name: "Words", from: 6, to: 10 }] }), /different/);
      await bad(frameB({ parts: [{ key: "A", name: "Grammar", from: 1, to: 5 }, { key: "B", name: "Words", from: 6, to: 11 }] }), /range/);
      await bad(frameB({ parts: [{ key: "A", name: "", from: 1, to: 5 }, { key: "B", name: "Words", from: 6, to: 10 }] }), /empty name/);
    });

    it("refuses a tag that does not exist for the track (unknown, or a Track A tag on a Track B frame)", async () => {
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, tag_key: "khong-co" } : i)) }), /tag does not exist/);
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, tag_key: "hien-tai-don" } : i)) }), /tag does not exist/);
    });

    it("refuses a tag that another family made up, and a retired tag", async () => {
      await q1("insert into english.error_tags(track_id, key, label_vi, family_id, origin) values ('B', 'x-other-fam-tag', 'Other tag', $1, 'custom')", [family2]);
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, tag_key: "x-other-fam-tag" } : i)) }), /tag does not exist/);
      await q1("insert into english.error_tags(track_id, key, label_vi, family_id, origin, retired_at) values ('B', 'x-old-tag', 'Old tag', $1, 'custom', now())", [s.familyId]);
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, tag_key: "x-old-tag" } : i)) }), /tag does not exist/);
    });

    it("refuses malformed items and scales", async () => {
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { n: 1, part: "A" } : i)) as never }), /each item is/);
      await bad(frameB({ items: base.items.map((i) => (i.n === 1 ? { ...i, extra: true } : i)) as never }), /each item is/);
      await bad(frameB({ scale: [{ min: 0, max: 5, label: "Low" }, { min: 5, max: 10, label: "High" }] }), /overlap/);
      await bad(frameB({ scale: [{ min: 0, max: 11, label: "Too far" }] }), /past total_items/);
      await bad(frameB({ scale: [{ min: 0, max: 5, label: "" }] }), /no label/);
      await bad(frameB({ scale: [{ min: 0, max: 5 }] as never }), /each scale band/);
    });

    it("a family can have one first version per title; a new version supersedes once", async () => {
      await expect(tryFrame(frameB())).rejects.toThrow(/duplicate|unique/);
      const v2 = await insertFrame(s.familyId, "B", frameB(), frameId);
      await expect(insertFrame(s.familyId, "B", frameB(), frameId)).rejects.toThrow(/duplicate|unique/);
      // a result cannot use the replaced version any more
      await fail(record(M().tutorNguyen, { frame: frameId, wrong: [1] }), "23514", /not available/);
      // put the current version back as the one the rest of the tests use
      frameId = v2;
    });

    it("a frame of another family or track is not available to a learner", async () => {
      const foreign = await insertFrame(family2, "B", frameB({ title: "Foreign test" }));
      await fail(record(M().tutorNguyen, { frame: foreign, wrong: [1] }), "23514", /not available/);
      const trackA = await insertFrame(s.familyId, "A", {
        title: "Tiny A test",
        total: 2,
        parts: [{ key: "A", name: "All", from: 1, to: 2 }],
        items: [{ n: 1, part: "A", tag_key: "hien-tai-don" }, { n: 2, part: "A", tag_key: "so-sanh" }],
        scale: null,
      });
      await fail(record(M().tutorNguyen, { frame: trackA, wrong: [1] }), "23514", /not available/);
      const ok = await record(M().tutorAn, { learner: AN(), frame: trackA, wrong: [2] });
      expect(ok.replayed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("recording a result", () => {
    it("frame mode: tags come from the frame, correct is derived, marks are written in the same call (first attempt counts)", async () => {
      const r = await record(M().tutorNguyen, { wrong: [2, 3, 5, 7], on: daysAgo(2), hint: true, clientId: "res-frame-1-aaaa" });
      expect(r.replayed).toBe(false);
      expect(r.untagged).toBe(0);
      const row = (await q1<{ correct: number; total_items: number; wrong_items: number[]; item_tags: { n: number; tag_key: string }[]; used_hint: boolean; recorded_role: string; title: string; context: string; attempt: string }>(
        "select * from english.results where id = $1", [r.id]))[0];
      expect(row).toMatchObject({ correct: 6, total_items: 10, wrong_items: [2, 3, 5, 7], used_hint: true, recorded_role: "tutor", title: expect.stringMatching(/^Tiny B test/), context: "home", attempt: "first" });
      expect(row?.item_tags).toEqual([
        { n: 2, tag_key: "cau-dieu-kien-dao-ngu" }, { n: 3, tag_key: "cau-dieu-kien-dao-ngu" }, { n: 5, tag_key: "wish-would-rather" }, { n: 7, tag_key: "dang-tu" },
      ]);
      const marks = await q1<{ tag_key: string; item_no: number; source: string; counts: boolean; marked_on: string }>(
        "select tag_key, item_no, source, counts, marked_on::text from english.tag_marks where source_id = $1 order by item_no", [r.id]);
      expect(marks.map((m) => [m.item_no, m.tag_key, m.source, m.counts, m.marked_on])).toEqual([
        [2, "cau-dieu-kien-dao-ngu", "test", true, daysAgo(2)], [3, "cau-dieu-kien-dao-ngu", "test", true, daysAgo(2)], [5, "wish-would-rather", "test", true, daysAgo(2)], [7, "dang-tu", "test", true, daysAgo(2)],
      ]);
    });

    it("never writes evidence: no observations, validation decisions, episodes or exposure rows come from results", async () => {
      const before = [
        await count("select count(*)::int as n from english.observations"),
        await count("select count(*)::int as n from english.validation_decisions"),
        await count("select count(*)::int as n from english.episodes"),
        await count("select count(*)::int as n from english.exposure_log"),
      ];
      await record(M().tutorNguyen, { wrong: [1], clientId: "res-noevidence-1" });
      await quick(M().parent, { clientId: "res-noevidence-2" });
      await noteV2(M().tutorNguyen, { weak: ["dang-tu"], clientId: "note-noevidence-1" });
      const after = [
        await count("select count(*)::int as n from english.observations"),
        await count("select count(*)::int as n from english.validation_decisions"),
        await count("select count(*)::int as n from english.episodes"),
        await count("select count(*)::int as n from english.exposure_log"),
      ];
      expect(after).toEqual(before);
    });

    it("gives the same receipt when sent again; a different body under the same id is refused", async () => {
      const rf = await freshFrame();
      const a = await record(M().tutorNguyen, { frame: rf, wrong: [4], clientId: "res-replay-0001" });
      const b = await record(M().tutorNguyen, { frame: rf, wrong: [4], clientId: "res-replay-0001" });
      expect(b).toEqual({ ...a, replayed: true });
      await fail(record(M().tutorNguyen, { frame: rf, wrong: [5], clientId: "res-replay-0001" }), "23505");
      expect(await count("select count(*)::int as n from english.results where client_id = 'res-replay-0001'")).toBe(1);
      expect(await count("select count(*)::int as n from english.tag_marks where source_id = $1", [a.id])).toBe(1);
    });

    it("quick mode: untagged wrong items are allowed (waiting for a tag); tags must be for wrong items, once each, and exist for the track", async () => {
      const r = await quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: "cau-dieu-kien-dao-ngu" }], clientId: "res-quick-0001" });
      expect(r.untagged).toBe(1);
      expect((await q1<{ item_tags: unknown }>("select item_tags from english.results where id = $1", [r.id]))[0]?.item_tags).toEqual([
        { n: 4, tag_key: "cau-dieu-kien-dao-ngu" }, { n: 7, tag_key: null },
      ]);
      expect(await count("select count(*)::int as n from english.tag_marks where source_id = $1", [r.id])).toBe(1);
      await fail(quick(M().tutorNguyen, { tags: [{ n: 9, tag_key: "dang-tu" }] }), "23514", /wrong items/);
      await fail(quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: "dang-tu" }, { n: 4, tag_key: "cum-dong-tu" }] }), "23514", /once each/);
      await fail(quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: "hien-tai-don" }] }), "23514", /does not exist/);
      await fail(quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: "khong-co" }] }), "23514", /does not exist/);
    });

    it("validates the numbers: right + wrong must add up, wrong items inside the test, no repeats, a title for quick results, dates in range", async () => {
      await fail(quick(M().tutorNguyen, { correct: 8, wrong: [4] }), "23514", /exactly the wrong items/);
      await fail(quick(M().tutorNguyen, { correct: 11, wrong: [] }), "22023");
      await fail(quick(M().tutorNguyen, { correct: 8, wrong: [4, 11] }), "23514");
      await fail(quick(M().tutorNguyen, { correct: 8, wrong: [4, 4] }), "22023", /twice/);
      await fail(quick(M().tutorNguyen, { title: "   " }), "22004");
      await fail(quick(M().tutorNguyen, { total: 0, correct: 0, wrong: [] }), "22023");
      await fail(record(M().tutorNguyen, { wrong: [11] }), "23514");
      await fail(record(M().tutorNguyen, { wrong: [1], on: addDays(TODAY, 1) }), "23514", /date/);
      await fail(record(M().tutorNguyen, { wrong: [1], on: daysAgo(121) }), "23514", /date/);
      await fail(record(M().tutorNguyen, { wrong: [1], tags: [{ n: 1, tag_key: "dang-tu" }] }), "22023", /from the frame/);
      await fail(record(M().tutorNguyen, { mode: "frame", frame: null, wrong: [1] }), "22004");
      await fail(record(M().tutorNguyen, { mode: "quick", frame: frameId, title: "x", total: 10, correct: 9, wrong: [1] }), "22023");
      await fail(record(M().tutorNguyen, { clientId: "short" }), "22023");
    });

    it("results made of nothing wrong are fine (10/10) and create no marks", async () => {
      const r = await record(M().tutorNguyen, { wrong: [], clientId: "res-perfect-001" });
      expect(await count("select count(*)::int as n from english.tag_marks where source_id = $1", [r.id])).toBe(0);
    });

    it("the table itself rejects inconsistent rows (correct vs wrong list, frame vs mode)", async () => {
      const ins = (over: Record<string, unknown>) =>
        db.client.query(
          `insert into english.results(learner_id, mode, frame_id, context, attempt, title, total_items, correct, wrong_items, taken_on, recorded_by_member, recorded_role, client_id)
           values ($1, $2, $3, 'home', 'first', 'x', $4, $5, $6::int[], current_date, $7, 'tutor', $8)`,
          [NG(), over.mode ?? "quick", over.frame ?? null, over.total ?? 10, over.correct ?? 9, over.wrong ?? [1], M().tutorNguyen, randomUUID()],
        );
      await expect(ins({ correct: 9, wrong: [1, 2] })).rejects.toThrow(/results_counts/);
      await expect(ins({ correct: 9, wrong: [11] })).rejects.toThrow(/results_counts/);
      await expect(ins({ mode: "frame", frame: null })).rejects.toThrow(/results_mode_frame/);
      await expect(ins({ mode: "quick", frame: frameId })).rejects.toThrow(/results_mode_frame/);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("who may record (D15-style) and who may not", () => {
    it("work done IN the session can only be recorded by a tutor: a parent is rejected by the database", async () => {
      await fail(record(M().parent, { wrong: [1], context: "class" }), "42501", /D15/);
      await fail(quick(M().parent, { context: "class" }), "42501", /D15/);
      const ok = await record(M().tutorNguyen, { wrong: [1], context: "class", clientId: "res-class-0001" });
      expect((await q1<{ context: string }>("select context from english.results where id = $1", [ok.id]))[0]?.context).toBe("class");
      // a parent may record work done at home (fallback entry)
      const home = await record(M().parent, { wrong: [1], clientId: "res-home-parent" });
      expect((await q1<{ recorded_role: string }>("select recorded_role from english.results where id = $1", [home.id]))[0]?.recorded_role).toBe("parent");
    });

    it("nobody else may record: the other child's tutor, a student, a parent of another family, an expired tutor", async () => {
      await fail(record(M().tutorAn, { wrong: [1] }), "42501");
      await fail(record(M().studentNguyen, { wrong: [1] }), "42501");
      await fail(record(M().studentAn, { wrong: [1] }), "42501");
      await fail(record(parent2Member, { wrong: [1] }), "42501");
      await fail(record(M().tutorAn, { wrong: [1], context: "class" }), "42501");
      const rel = (await q1<{ id: string }>("select id from english.relationships where member_id = $1 and learner_id = $2 and relation = 'tutor'", [M().tutorNguyen, NG()]))[0];
      await q1("update english.relationships set valid_from = now() - interval '2 days', valid_to = now() - interval '1 day' where id = $1", [rel?.id]);
      try {
        await fail(record(M().tutorNguyen, { wrong: [1], context: "class" }), "42501");
        await fail(record(M().tutorNguyen, { wrong: [1] }), "42501");
      } finally {
        await q1("update english.relationships set valid_from = now() - interval '1 day', valid_to = null where id = $1", [rel?.id]);
      }
      await record(M().tutorNguyen, { wrong: [1], clientId: "res-after-expiry" });
    });

    it("tagging, tagging writing and the custom-tag function follow the same actor rule", async () => {
      const r = await quick(M().tutorNguyen, { clientId: "res-actor-0001" });
      for (const who of [M().tutorAn, M().studentNguyen, parent2Member]) {
        await fail(tagItems(who, r.id, [{ n: 4, tag_key: "dang-tu" }]), "42501");
        await fail(noteV2(who, { weak: ["dang-tu"] }), "42501");
        await fail(svc("select english.eng_add_error_tag($1, 'x-abc', 'Abc', $2) as r", [NG(), who]), "42501");
      }
      // the child's own tutor and the parent can
      expect((await tagItems(M().tutorNguyen, r.id, [{ n: 4, tag_key: "dang-tu" }])).tagged).toBe(1);
      expect((await tagItems(M().parent, r.id, [{ n: 7, tag_key: "cum-dong-tu" }])).tagged).toBe(1);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("untagged queue and tagging later", () => {
    it("lists wrong items without a tag; tagging by the parent fills them (counted from the result's date); same tag again is a replay", async () => {
      const r = await quick(M().tutorNguyen, { learner: NG(), wrong: [2, 9], correct: 8, on: daysAgo(3), clientId: "res-queue-0001", title: "Queue test" });
      expect(r.untagged).toBe(2);
      const q = (await queue(NG())).items.find((i) => i.result_id === r.id);
      expect(q?.items).toEqual([2, 9]);
      expect(q?.source).toBe("practice");
      expect(await tagItems(M().parent, r.id, [{ n: 2, tag_key: "cau-dieu-kien-dao-ngu" }])).toEqual({ tagged: 1, replayed: false });
      expect((await queue(NG())).items.find((i) => i.result_id === r.id)?.items).toEqual([9]);
      expect(await tagItems(M().parent, r.id, [{ n: 2, tag_key: "cau-dieu-kien-dao-ngu" }])).toEqual({ tagged: 0, replayed: true });
      await fail(tagItems(M().tutorNguyen, r.id, [{ n: 2, tag_key: "dang-tu" }]), "23505");
      await fail(tagItems(M().tutorNguyen, r.id, [{ n: 5, tag_key: "dang-tu" }]), "23514", /not a wrong item/);
      await fail(tagItems(M().tutorNguyen, r.id, [{ n: 9, tag_key: "hien-tai-don" }]), "23514", /does not exist/);
      await tagItems(M().tutorNguyen, r.id, [{ n: 9, tag_key: "dang-tu" }]);
      expect((await queue(NG())).items.find((i) => i.result_id === r.id)).toBeUndefined();
      const m = await q1<{ item_no: number; marked_on: string; source: string; recorded_by_member: string }>("select item_no, marked_on::text, source, recorded_by_member from english.tag_marks where source_id = $1 order by item_no", [r.id]);
      expect(m.map((x) => [x.item_no, x.marked_on, x.source])).toEqual([[2, daysAgo(3), "practice"], [9, daysAgo(3), "practice"]]);
    });

    it("framed items cannot be re-tagged (the frame decides); retries do not enter the queue; replaced results cannot be tagged", async () => {
      const f = await record(M().tutorNguyen, { wrong: [6], clientId: "res-queue-frame" });
      await fail(tagItems(M().tutorNguyen, f.id, [{ n: 6, tag_key: "cum-dong-tu" }]), "23505", /already has a tag/);
      const retry = await quick(M().tutorNguyen, { attempt: "retry", clientId: "res-queue-retry", title: "Retry only" });
      expect((await queue(NG())).items.find((i) => i.result_id === retry.id)).toBeUndefined();
      const first = await quick(M().tutorNguyen, { clientId: "res-queue-old1", title: "Old entry" });
      const fix = await quick(M().tutorNguyen, { clientId: "res-queue-new1", title: "Corrected entry", supersedes: first.id });
      await fail(tagItems(M().tutorNguyen, first.id, [{ n: 4, tag_key: "dang-tu" }]), "23505", /replaced/);
      const ids = (await queue(NG())).items.map((i) => i.result_id);
      expect(ids).toContain(fix.id);
      expect(ids).not.toContain(first.id);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("Điểm cần chú ý (eng_weak_points): first attempts only, current sources only", () => {
    let wl: string; // a clean learner for exact numbers
    beforeAll(async () => {
      // A second Track B child of the test family with its own tutor-less history; the parent records everything.
      wl = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Clean child', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, wl]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [wl]);
    });

    it("one test with several wrong items of a tag is ONE source ('watch'); a second source makes it 'repeat'", async () => {
      const r1x = await record(M().parent, { learner: wl, wrong: [1, 2, 3], on: daysAgo(10), clientId: "weak-1-aaaaaa" });
      let w = await weak(wl);
      const t1 = tagOf(w, "cau-dieu-kien-dao-ngu");
      expect(t1).toMatchObject({ sources: 1, status: "watch", by_source: { test: 1, practice: 0, lesson: 0, writing: 0 }, items_wrong: { test: 3, practice: 0 } });
      expect(t1?.events[0]).toMatchObject({ source: "test", items: [1, 2, 3], title: expect.stringMatching(/^Tiny B test/), date: daysAgo(10) });
      // a note in the session names the same tag: a second, different source
      await noteV2(M().parent, { learner: wl, date: daysAgo(8), weak: ["cau-dieu-kien-dao-ngu"], clientId: "weak-note-0001" });
      w = await weak(wl);
      expect(tagOf(w, "cau-dieu-kien-dao-ngu")).toMatchObject({ sources: 2, status: "repeat", by_source: { test: 1, lesson: 1 } });
      expect(w.tags[0]?.tag_key).toBe("cau-dieu-kien-dao-ngu"); // repeats first
      expect(r1x.untagged).toBe(0);
    });

    it("a tag that was asked and answered right shows as 'ok' with the asked/wrong count", async () => {
      const w = await weak(wl);
      expect(tagOf(w, "cum-dong-tu")).toMatchObject({ status: "ok", sources: 0, asked_correct: { asked: 2, wrong: 0 } });
      expect(tagOf(w, "dang-tu")).toMatchObject({ status: "ok", asked_correct: { asked: 3, wrong: 0 } });
    });

    it("retries are stored but never counted", async () => {
      const retry = await record(M().parent, { learner: wl, wrong: [6, 7], attempt: "retry", on: daysAgo(5), clientId: "weak-retry-001" });
      const marks = await q1<{ counts: boolean }>("select counts from english.tag_marks where source_id = $1", [retry.id]);
      expect(marks).toEqual([{ counts: false }, { counts: false }]);
      const w = await weak(wl);
      expect(tagOf(w, "dang-tu")?.sources ?? 0).toBe(0);
      expect(tagOf(w, "dang-tu")?.asked_correct.wrong).toBe(0); // retries are not "asked" either
      // quick retries too
      await quick(M().parent, { learner: wl, attempt: "retry", tags: [{ n: 4, tag_key: "thanh-ngu" }, { n: 7, tag_key: "thanh-ngu" }], on: daysAgo(4), clientId: "weak-retry-002" });
      expect(tagOf(await weak(wl), "thanh-ngu")).toBeUndefined();
    });

    it("a hint is stored and shown, and the mark still counts", async () => {
      await quick(M().parent, { learner: wl, hint: true, tags: [{ n: 4, tag_key: "tu-noi-lap-luan" }, { n: 7, tag_key: "tu-noi-lap-luan" }], on: daysAgo(6), clientId: "weak-hint-0001", title: "Hint practice" });
      const t = tagOf(await weak(wl), "tu-noi-lap-luan");
      expect(t).toMatchObject({ sources: 1, status: "watch", by_source: { practice: 1 }, items_wrong: { practice: 2 } });
      expect(t?.events[0]).toMatchObject({ used_hint: true, source: "practice", title: "Hint practice" });
    });

    it("a replaced result stops counting; the replacement counts", async () => {
      const wrong = await quick(M().parent, { learner: wl, tags: [{ n: 4, tag_key: "phat-am" }, { n: 7, tag_key: "phat-am" }], on: daysAgo(7), clientId: "weak-super-001", title: "Typo entry" });
      expect(tagOf(await weak(wl), "phat-am")).toMatchObject({ sources: 1 });
      const fix = await quick(M().parent, { learner: wl, tags: [{ n: 4, tag_key: "thanh-ngu" }, { n: 7, tag_key: "thanh-ngu" }], on: daysAgo(7), clientId: "weak-super-002", title: "Fixed entry", supersedes: wrong.id });
      const w = await weak(wl);
      expect(tagOf(w, "phat-am")).toBeUndefined();
      expect(tagOf(w, "thanh-ngu")).toMatchObject({ sources: 1, status: "watch" });
      await fail(quick(M().parent, { learner: wl, clientId: "weak-super-003", supersedes: wrong.id }), "23505");
      await fail(quick(M().parent, { learner: wl, clientId: "weak-super-004", supersedes: randomUUID() }), "P0002");
      void fix;
    });

    it("a replaced lesson note stops counting too", async () => {
      const n1 = await noteV2(M().parent, { learner: wl, date: daysAgo(9), weak: ["modal-suy-doan"], clientId: "weak-note-sup1" });
      expect(tagOf(await weak(wl), "modal-suy-doan")).toMatchObject({ sources: 1 });
      await noteV2(M().parent, { learner: wl, date: daysAgo(9), weak: ["bi-dong-nho-tuong-thuat"], clientId: "weak-note-sup2", supersedes: n1.id });
      const w = await weak(wl);
      expect(tagOf(w, "modal-suy-doan")).toBeUndefined();
      expect(tagOf(w, "bi-dong-nho-tuong-thuat")).toMatchObject({ sources: 1, by_source: { lesson: 1 } });
    });

    it("the window filter drops older marks", async () => {
      const all = await weak(wl);
      const recent = await weak(wl, daysAgo(7));
      expect(tagOf(all, "cau-dieu-kien-dao-ngu")?.sources).toBe(2);
      expect(tagOf(recent, "cau-dieu-kien-dao-ngu")).toBeUndefined(); // 10 and 8 days ago are outside a 7-day window
      expect(tagOf(recent, "tu-noi-lap-luan")?.sources).toBe(1); // 6 days ago is inside
    });

    it("writing tags: tutor or parent tag a written episode (max 3, first attempt counts); not other kinds of work; students cannot", async () => {
      expect(await tagEpisode(M().tutorAn, ep6, ["tu-vung-chu-de", "viet-cau"])).toEqual({ added: 2, replayed: false });
      expect(await tagEpisode(M().parent, ep6, ["viet-cau"])).toEqual({ added: 0, replayed: true });
      await fail(tagEpisode(M().parent, ep6, ["doc-hieu", "nghe"]), "23514", /at most 3/);
      await tagEpisode(M().parent, ep6, ["doc-hieu"]);
      await fail(tagEpisode(M().tutorAn, ep11, ["khong-co"]), "23514", /does not exist/);
      await fail(tagEpisode(M().tutorAn, ep11, ["cau-dieu-kien-dao-ngu"]), "23514", /does not exist/); // a Track B tag on a Track A child
      await fail(tagEpisode(M().tutorAn, ep3, ["doc-hieu"]), "23514", /written work/);
      await fail(tagEpisode(M().tutorNguyen, ep6, ["viet-cau"]), "42501");
      await fail(tagEpisode(M().studentAn, ep6, ["viet-cau"]), "42501");
      await fail(tagEpisode(parent2Member, ep6, ["viet-cau"]), "42501");
      const w = await weak(AN());
      expect(tagOf(w, "viet-cau")).toMatchObject({ sources: 1, by_source: { writing: 1 }, status: "watch" });
      expect(tagOf(w, "viet-cau")?.events[0]).toMatchObject({ source: "writing", source_id: ep6 });
      // the review itself is untouched: tagging writes no observation and no decision
      expect(await count("select count(*)::int as n from english.observations where episode_id = $1", [ep6])).toBe(0);
      // a checkpoint writing episode can be tagged as well (a tag is a signal, not a score)
      await tagEpisode(M().tutorAn, ep11, ["viet-cau"]);
      expect(tagOf(await weak(AN()), "viet-cau")).toMatchObject({ sources: 2, status: "repeat" });
      void epB5;
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("recheck due comes from the learner's assessment policy, not from a number in the code", () => {
    let rc: string;
    beforeAll(async () => {
      rc = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Recheck child', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, rc]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [rc]);
    });
    const policyDays = async () =>
      Number((await q1<{ d: string }>(
        `select p.config -> 'transferable' ->> 'delayedMinDaysFromLastExposure' as d
         from english.assessment_policies p where p.version = 'AP-0.2-pilot'`))[0]?.d);

    it("the pilot policy says 14 and the function reports exactly that", async () => {
      expect(await policyDays()).toBe(14);
      await quick(M().parent, { learner: rc, tags: [{ n: 4, tag_key: "cum-dong-tu" }, { n: 7, tag_key: "cum-dong-tu" }], on: daysAgo(10), clientId: "rc-mark-0001" });
      const w = await weak(rc);
      expect(w.policy_days).toBe(14);
      const t = tagOf(w, "cum-dong-tu");
      expect(t?.last_seen).toBe(daysAgo(10));
      expect(t?.recheck_due_on).toBe(addDays(daysAgo(10), 14));
      expect(t?.recheck_due).toBe(false);
    });

    it("a change in the policy changes the answer (no hard-coded 14): proven inside a transaction that is rolled back", async () => {
      await db.client.query("begin");
      try {
        await db.client.query("set local session_replication_role = replica"); // lets the owner bypass the 'published is immutable' trigger, for this test only
        await db.client.query(`update english.assessment_policies set config = jsonb_set(config, '{transferable,delayedMinDaysFromLastExposure}', '7') where version = 'AP-0.2-pilot'`);
        const w = (await db.client.query<{ r: Weak }>("select english.eng_weak_points($1, null) as r", [rc])).rows[0]?.r as Weak;
        expect(w.policy_days).toBe(7);
        const t = tagOf(w, "cum-dong-tu");
        expect(t?.recheck_due_on).toBe(addDays(daysAgo(10), 7));
        expect(t?.recheck_due).toBe(true);
      } finally {
        await db.client.query("rollback");
      }
      expect((await weak(rc)).policy_days).toBe(14);
    });

    it("a learner without a target set has no policy: no due date is invented", async () => {
      const bare = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'No set child', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, bare]);
      await quick(M().parent, { learner: bare, clientId: "rc-bare-00001", tags: [{ n: 4, tag_key: "cum-dong-tu" }, { n: 7, tag_key: "cum-dong-tu" }], on: daysAgo(40) });
      const w = await weak(bare);
      expect(w.policy_days).toBeNull();
      expect(tagOf(w, "cum-dong-tu")).toMatchObject({ recheck_due_on: null, recheck_due: false });
    });

    it("due once the days have passed; 'not asked' keeps it due; 'ok' resolves it; 'still wrong' adds a counting mark and restarts the wait", async () => {
      const old = await quick(M().parent, { learner: rc, tags: [{ n: 4, tag_key: "thanh-ngu" }, { n: 7, tag_key: "thanh-ngu" }], on: daysAgo(20), clientId: "rc-mark-0002", title: "Idioms" });
      expect(tagOf(await weak(rc), "thanh-ngu")).toMatchObject({ recheck_due: true, recheck_due_on: addDays(daysAgo(20), 14), status: "watch" });
      await noteV2(M().parent, { learner: rc, date: daysAgo(1), studied: "Unit 14", rechecks: [{ tag_key: "thanh-ngu", result: "not_asked" }], clientId: "rc-note-0001" });
      expect(tagOf(await weak(rc), "thanh-ngu")).toMatchObject({ recheck_due: true, last_recheck: { result: "not_asked" } });
      // still wrong: a new counting mark from the session, so now two sources and the wait restarts from that day
      await noteV2(M().parent, { learner: rc, date: daysAgo(1), studied: "Unit 14 again", rechecks: [{ tag_key: "thanh-ngu", result: "still_wrong" }], clientId: "rc-note-0002" });
      let t = tagOf(await weak(rc), "thanh-ngu");
      expect(t).toMatchObject({ sources: 2, status: "repeat", recheck_due: false, recheck_due_on: addDays(daysAgo(1), 14), last_recheck: { result: "still_wrong" } });
      // ok: asked again and fine -> resolved ('ok'), not due
      await noteV2(M().parent, { learner: rc, date: TODAY, studied: "Unit 15", rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }], clientId: "rc-note-0003" });
      t = tagOf(await weak(rc), "cum-dong-tu");
      expect(t).toMatchObject({ status: "ok", recheck_due: false, last_recheck: { result: "ok" } });
      void old;
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("lesson note v2", () => {
    it("tutor and parent can write it; it is shared; weak tags become lesson marks; the old function still works", async () => {
      const a = await noteV2(M().tutorNguyen, { weak: ["dang-tu", "cum-dong-tu"], message: "Em ôn lại dạng từ nhé.", parent: "Hôm nay em hơi mệt.", studied: "Unit 13 · Environment", clientId: "note-v2-aaaaa" });
      const row = (await q1<{ author_role: string; published: boolean; weak_tag_keys: string[]; message_to_learner: string; note_for_parent: string; goals: string; support_level: string | null; next_actions: string[] }>(
        "select * from english.lesson_notes where id = $1", [a.id]))[0];
      expect(row).toMatchObject({ author_role: "tutor", published: true, weak_tag_keys: ["dang-tu", "cum-dong-tu"], message_to_learner: "Em ôn lại dạng từ nhé.", note_for_parent: "Hôm nay em hơi mệt.", goals: "Unit 13 · Environment", support_level: null, next_actions: [] });
      expect(await count("select count(*)::int as n from english.tag_marks where source = 'lesson' and source_id = $1 and counts", [a.id])).toBe(2);
      const p = await noteV2(M().parent, { weak: [], message: "Cô nhắc em", clientId: "note-v2-bbbbb" });
      expect((await q1<{ author_role: string }>("select author_role from english.lesson_notes where id = $1", [p.id]))[0]?.author_role).toBe("parent");
      // the v1 writer still requires a tutor and a support level
      const v1 = await svc<{ id: string }>("select english.eng_write_lesson_note($1, $2::date, 'g', 'o', 'light', '{a}'::text[], '{}'::text[], false, null, $3, $4) as r", [NG(), TODAY, M().tutorNguyen, "note-v1-ccccc"]);
      expect((await q1<{ support_level: string; author_role: string }>("select support_level, author_role from english.lesson_notes where id = $1", [v1.id]))[0]).toEqual({ support_level: "light", author_role: "tutor" });
      await fail(svc("select english.eng_write_lesson_note($1, $2::date, 'g', 'o', null, '{a}'::text[], '{}'::text[], false, null, $3, $4) as r", [NG(), TODAY, M().tutorNguyen, "note-v1-ddddd"]), "22004");
    });

    it("limits: at most 3 weak tags, known tags only, text lengths, something to say, date range, one recheck per tag", async () => {
      await fail(noteV2(M().tutorNguyen, { weak: ["dang-tu", "cum-dong-tu", "thanh-ngu", "phat-am"] }), "23514", /at most 3/);
      await fail(noteV2(M().tutorNguyen, { weak: ["hien-tai-don"] }), "23514", /does not exist/);
      await fail(noteV2(M().tutorNguyen, { message: "x".repeat(501) }), "22023", /too long/);
      await fail(noteV2(M().tutorNguyen, { parent: "x".repeat(1001) }), "22023", /too long/);
      await fail(noteV2(M().tutorNguyen, { studied: "x".repeat(301) }), "22023", /too long/);
      await fail(noteV2(M().tutorNguyen, { studied: null, weak: [], message: null, parent: null }), "23514", /at least one/);
      await fail(noteV2(M().tutorNguyen, { date: addDays(TODAY, 1) }), "23514", /date/);
      await fail(noteV2(M().tutorNguyen, { date: daysAgo(121) }), "23514", /date/);
      await fail(noteV2(M().tutorNguyen, { rechecks: [{ tag_key: "dang-tu", result: "ok" }, { tag_key: "dang-tu", result: "still_wrong" }] }), "22023", /once per note/);
      await fail(noteV2(M().tutorNguyen, { rechecks: [{ tag_key: "dang-tu", result: "maybe" }] }), "22023");
      // exactly 500 / 1000 characters are fine
      await noteV2(M().tutorNguyen, { message: "x".repeat(500), parent: "y".repeat(1000), clientId: "note-v2-limits" });
    });

    it("sent twice it is the same note; a different body under the same id is refused; only the author edits, once", async () => {
      const a = await noteV2(M().tutorNguyen, { weak: ["thanh-ngu"], clientId: "note-v2-replay" });
      expect(await noteV2(M().tutorNguyen, { weak: ["thanh-ngu"], clientId: "note-v2-replay" })).toEqual({ ...a, replayed: true });
      await fail(noteV2(M().tutorNguyen, { weak: ["dang-tu"], clientId: "note-v2-replay" }), "23505");
      await fail(noteV2(M().tutorNguyen, { weak: ["thanh-ngu"], rechecks: [{ tag_key: "dang-tu", result: "ok" }], clientId: "note-v2-replay" }), "23505");
      const edit = await noteV2(M().tutorNguyen, { weak: ["thanh-ngu", "dang-tu"], supersedes: a.id, clientId: "note-v2-edit-1" });
      await fail(noteV2(M().parent, { supersedes: edit.id, clientId: "note-v2-edit-2" }), "42501", /author/);
      await fail(noteV2(M().tutorNguyen, { supersedes: a.id, clientId: "note-v2-edit-3" }), "23505", /already replaced/);
    });

    it("a future date or an invalid recheck never leaves half a note behind", async () => {
      const before = [await count("select count(*)::int as n from english.lesson_notes"), await count("select count(*)::int as n from english.tag_marks")];
      await fail(noteV2(M().tutorNguyen, { weak: ["dang-tu"], rechecks: [{ tag_key: "khong-co", result: "ok" }], clientId: "note-v2-atomic" }), "23514");
      expect([await count("select count(*)::int as n from english.lesson_notes"), await count("select count(*)::int as n from english.tag_marks")]).toEqual(before);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("custom tags (keys are made with a random tail, so they never collide)", () => {
    // the real path: the server turns the label into "x-<slug>" (customTagKey) and the function adds the tail
    const add = (learner: string, label: string, by: string) =>
      svc<{ key: string; label_vi: string; created: boolean }>("select english.eng_add_error_tag($1, $2, $3, $4) as r", [learner, customTagKey(label), label, by]);

    it("staff add a tag for the child's track; the same label returns the existing one; seed labels are not duplicated", async () => {
      const a = await add(NG(), "Mệnh đề quan hệ", M().tutorNguyen);
      expect(a).toMatchObject({ label_vi: "Mệnh đề quan hệ", created: true });
      expect(a.key).toMatch(/^x-menh-de-quan-he-[0-9a-f]{5}$/);
      menhKey = a.key;
      const again = await add(NG(), " mệnh  đề   quan hệ ", M().parent);
      expect(again).toMatchObject({ key: menhKey, created: false });
      const seedDup = await add(NG(), "Dạng từ", M().tutorNguyen);
      expect(seedDup).toMatchObject({ key: "dang-tu", created: false });
      await fail(svc("select english.eng_add_error_tag($1, 'khong-x', 'Nhãn', $2) as r", [NG(), M().tutorNguyen]), "22023");
      await fail(svc("select english.eng_add_error_tag($1, 'x-ok', 'N', $2) as r", [NG(), M().tutorNguyen]), "22023"); // label too short
      // the new tag is usable straight away, but only for that family and track
      await quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: menhKey }, { n: 7, tag_key: null }], clientId: "res-custom-0001" });
      await fail(quick(M().tutorAn, { learner: AN(), tags: [{ n: 4, tag_key: menhKey }] }), "23514", /does not exist/);
      await fail(quick(parent2Member, { learner: learner2, tags: [{ n: 4, tag_key: menhKey }] }), "23514", /does not exist/);
    });

    it("the same label in two families gives two different keys, and neither family ever sees the other's tag or an error", async () => {
      const other = await add(learner2, "Mệnh đề quan hệ", parent2Member);
      expect(other).toMatchObject({ label_vi: "Mệnh đề quan hệ", created: true });
      expect(other.key).toMatch(/^x-menh-de-quan-he-[0-9a-f]{5}$/);
      expect(other.key).not.toBe(menhKey);
      // each family keeps its own; the second family's call did not return the first family's tag
      const again = await add(learner2, "mệnh đề quan hệ", parent2Member);
      expect(again).toMatchObject({ key: other.key, created: false });
      expect(await rowsAs(db.client, "authenticated", parent2User, "select 1 from english.error_tags where key = $1", [menhKey])).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.parent, "select 1 from english.error_tags where key = $1", [other.key])).toEqual([]);
    });

    it("two near-identical labels in one family become two tags (no clash on the slug)", async () => {
      const a = await add(NG(), "Đảo ngữ", M().tutorNguyen);
      const b = await add(NG(), "Dao ngu!", M().tutorNguyen);
      expect(a.created && b.created).toBe(true);
      expect(a.key).not.toBe(b.key);
      expect(a.key).toMatch(/^x-dao-ngu-[0-9a-f]{5}$/);
      expect(b.key).toMatch(/^x-dao-ngu-[0-9a-f]{5}$/);
      expect(await add(NG(), "đảo ngữ", M().parent)).toMatchObject({ key: a.key, created: false });
    });

    it("a retired tag is never handed back: the same label makes a fresh active tag", async () => {
      const a = await add(NG(), "Thì quá khứ hoàn thành", M().tutorNguyen);
      await q1("update english.error_tags set retired_at = now() where key = $1", [a.key]);
      const b = await add(NG(), "Thì quá khứ hoàn thành", M().tutorNguyen);
      expect(b.created).toBe(true);
      expect(b.key).not.toBe(a.key);
      // the retired one cannot be used any more, the fresh one can
      await fail(quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: a.key }] }), "23514", /does not exist/);
      await quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: b.key }] });
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("visibility: students read nothing; nobody reads across families or children; writes only through the functions", () => {
    const TABLES = ["error_tags", "test_frames", "results", "tag_marks", "recheck_events"] as const;
    const readable = async (userId: string | null, table: string) => (await rowsAs(db.client, "authenticated", userId, `select * from english.${table}`)).length;

    it("students read 0 rows of every new table (and no new note)", async () => {
      for (const table of TABLES) {
        expect(await count(`select count(*)::int as n from english.${table}`), `${table} has data`).toBeGreaterThan(0);
        expect(await readable(s.users.studentAn, table), `An / ${table}`).toBe(0);
        expect(await readable(s.users.studentNguyen, table), `Nguyên / ${table}`).toBe(0);
      }
      expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select * from english.lesson_notes")).toEqual([]);
      for (const table of TABLES) expect(await errorAs(db.client, "anon", null, `select * from english.${table}`)).toMatchObject({ code: "42501" });
    });

    it("another family reads none of this family's results, marks, rechecks or frames (it sees only the shared seed tags and its own)", async () => {
      for (const table of ["test_frames", "results", "tag_marks", "recheck_events"] as const) {
        const rows = await rowsAs<{ learner_id?: string; family_id?: string }>(db.client, "authenticated", parent2User, `select * from english.${table}`);
        for (const r of rows) {
          expect(r.learner_id === undefined || r.learner_id === learner2, `${table} leaked ${r.learner_id}`).toBe(true);
          expect(r.family_id === undefined || r.family_id === family2, `${table} leaked a frame`).toBe(true);
        }
      }
      const tags = await rowsAs<{ family_id: string | null }>(db.client, "authenticated", parent2User, "select family_id from english.error_tags");
      expect(tags.every((t) => t.family_id === null || t.family_id === family2)).toBe(true);
      // the parent of family 2 sees family 2's own custom tag but not the first family's
      expect(await rowsAs(db.client, "authenticated", parent2User, "select 1 from english.error_tags where key = $1", [menhKey])).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", parent2User, "select 1 from english.error_tags where key = 'x-other-fam-tag'")).toHaveLength(1);
    });

    it("a tutor reads only their own child's results and marks", async () => {
      const rowsAn = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.tutorAn, "select learner_id from english.results union all select learner_id from english.tag_marks");
      expect(rowsAn.length).toBeGreaterThan(0);
      expect(rowsAn.every((r) => r.learner_id === AN())).toBe(true);
      const rowsNg = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.tutorNguyen, "select learner_id from english.results union all select learner_id from english.tag_marks union all select learner_id from english.recheck_events");
      expect(rowsNg.length).toBeGreaterThan(0);
      expect(rowsNg.every((r) => r.learner_id === NG())).toBe(true);
    });

    it("the parent of the family reads both children's rows; the parent also reads the notes v2 (shared)", async () => {
      const learners = new Set((await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.parent, "select learner_id from english.results")).map((r) => r.learner_id));
      expect(learners.has(AN())).toBe(true);
      expect(learners.has(NG())).toBe(true);
      const notes = await rowsAs<{ id: string }>(db.client, "authenticated", s.users.parent, "select id from english.lesson_notes where learner_id = $1 and author_role = 'tutor' and message_to_learner is not null", [NG()]);
      expect(notes.length).toBeGreaterThan(0);
    });

    it("nobody writes the tables directly (authenticated, anon, service_role), and the functions run for service_role only", async () => {
      for (const table of TABLES) {
        for (const [role, user] of [["authenticated", s.users.parent], ["authenticated", s.users.studentAn], ["service_role", null]] as const) {
          for (const sql of [`insert into english.${table} select * from english.${table} limit 1`, `update english.${table} set created_at = now()`, `delete from english.${table}`]) {
            const err = await errorAs(db.client, role, user, sql);
            expect(err?.code, `${role} ${sql}`).toBe("42501");
          }
        }
      }
      const calls: [string, unknown[]][] = [
        ["select english.eng_record_result($1::uuid, 'frame', $2::uuid, null::text, null::int, null::int, '{}'::int[], null::jsonb, 'home', 'first', false, current_date, null::uuid, null::uuid, $3::uuid, 'client-id-xyz')", [NG(), frameId, M().tutorNguyen]],
        ["select english.eng_tag_result_items($1::uuid, '[]'::jsonb, $2::uuid)", [randomUUID(), M().tutorNguyen]],
        ["select english.eng_tag_episode($1::uuid, '{viet-cau}'::text[], $2::uuid)", [ep6, M().tutorAn]],
        ["select english.eng_write_lesson_note_v2($1::uuid, current_date, 'x', '{}'::text[], null::text, null::text, '[]'::jsonb, null::uuid, $2::uuid, 'client-id-xyz')", [NG(), M().tutorNguyen]],
        ["select english.eng_weak_points($1::uuid, null::date)", [NG()]],
        ["select english.eng_untagged_queue($1::uuid)", [NG()]],
        ["select english.eng_add_error_tag($1::uuid, 'x-abc', 'Abc', $2::uuid)", [NG(), M().tutorNguyen]],
      ];
      for (const [sql, params] of calls) {
        for (const [role, user] of [["authenticated", s.users.tutorNguyen], ["authenticated", s.users.parent], ["authenticated", s.users.studentNguyen], ["anon", null]] as const) {
          const err = await errorAs(db.client, role, user, sql, params);
          expect(err?.code, `${role} ${sql}`).toBe("42501");
        }
      }
    });

    it("the earlier student boundary still holds: RLS stays on, students never reach the review functions", async () => {
      const rls = await q1<{ relname: string; relrowsecurity: boolean }>(
        "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'english' and c.relname = any($1)",
        [[...TABLES, "login_names"]],
      );
      expect(rls).toHaveLength(6);
      expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("review fixes: replacing results, duplicate first attempts, rechecks, source, D15 on writing tags, v1 vs v2 notes", () => {
    let child: string; // a clean Track B child of the test family
    beforeAll(async () => {
      child = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Fix child', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, child]);
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [M().tutorNguyen, child]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [child]);
    });

    it("replacing a result: only the member who recorded it, and only for the same learner", async () => {
      const cls = await quick(M().tutorNguyen, { learner: child, context: "class", clientId: "fix-class-0001", title: "In class" });
      // a parent cannot replace a tutor's class result; neither can another tutor
      await fail(quick(M().parent, { learner: child, supersedes: cls.id, clientId: "fix-class-0002" }), "42501", /may replace/);
      await fail(quick(M().tutorAn, { learner: child, supersedes: cls.id, clientId: "fix-class-0003" }), "42501");
      await fail(quick(M().studentNguyen, { learner: child, supersedes: cls.id, clientId: "fix-class-0004" }), "42501");
      // the parent cannot replace it with a class result either
      await fail(quick(M().parent, { learner: child, supersedes: cls.id, context: "class", clientId: "fix-class-0005" }), "42501");
      // a result of another child cannot be replaced from this child (the learner must be the same)
      await fail(quick(M().tutorAn, { learner: AN(), supersedes: cls.id, clientId: "fix-class-0006" }), "P0002");
      // the author (a tutor with an active relationship) can; the class result is then replaced exactly once
      const fixed = await quick(M().tutorNguyen, { learner: child, supersedes: cls.id, context: "class", clientId: "fix-class-0007", title: "In class (fixed)" });
      expect(fixed.replayed).toBe(false);
      await fail(quick(M().tutorNguyen, { learner: child, supersedes: cls.id, clientId: "fix-class-0008" }), "23505");

      // a home result the parent made: the tutor may not replace it, the parent may
      const home = await quick(M().parent, { learner: child, clientId: "fix-home-0001", title: "Home" });
      await fail(quick(M().tutorNguyen, { learner: child, supersedes: home.id, clientId: "fix-home-0002" }), "42501", /may replace/);
      await quick(M().parent, { learner: child, supersedes: home.id, clientId: "fix-home-0003", title: "Home (fixed)" });
    });

    it("a second FIRST attempt of the same test is refused (409 by code 23505 duplicate_first) unless it replaces the earlier one; retries are fine", async () => {
      const f = await freshFrame();
      const first = await record(M().tutorNguyen, { learner: child, frame: f, wrong: [1], clientId: "fix-first-0001" });
      await fail(record(M().tutorNguyen, { learner: child, frame: f, wrong: [2], clientId: "fix-first-0002" }), "23505", /duplicate_first/);
      await fail(record(M().parent, { learner: child, frame: f, wrong: [2], clientId: "fix-first-0003" }), "23505", /duplicate_first/);
      // the same request again is still a replay, not a duplicate
      expect(await record(M().tutorNguyen, { learner: child, frame: f, wrong: [1], clientId: "fix-first-0001" })).toEqual({ ...first, replayed: true });
      // a retry is a different kind of attempt
      await record(M().tutorNguyen, { learner: child, frame: f, wrong: [2], attempt: "retry", clientId: "fix-first-0004" });
      // a new version of the frame is the same test: still a duplicate
      const v2 = await insertFrame(s.familyId, "B", frameB({ title: "Tiny B test (v2)" }), f);
      await fail(record(M().tutorNguyen, { learner: child, frame: v2, wrong: [2], clientId: "fix-first-0005" }), "23505", /duplicate_first/);
      // replacing the earlier first attempt is how to correct it; afterwards the replacement is the current one
      const fixed = await record(M().tutorNguyen, { learner: child, frame: v2, wrong: [2, 3], supersedes: first.id, clientId: "fix-first-0006" });
      await fail(record(M().tutorNguyen, { learner: child, frame: v2, wrong: [4], clientId: "fix-first-0007" }), "23505", /duplicate_first/);
      expect(fixed.replayed).toBe(false);
      // another child may take the same test; quick results are never "duplicates"
      const sibling = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Sibling', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, sibling]);
      await record(M().parent, { learner: sibling, frame: v2, wrong: [1], clientId: "fix-first-0008" });
      await quick(M().parent, { learner: child, clientId: "fix-first-0009", title: "Same quick title" });
      await quick(M().parent, { learner: child, clientId: "fix-first-0010", title: "Same quick title" });
    });

    it("the source of a quick result is a choice (test or practice, default practice); a framed result is always a test; late tags keep the source", async () => {
      const dflt = await quick(M().tutorNguyen, { learner: child, tags: [{ n: 4, tag_key: "dang-tu" }], clientId: "fix-src-0001", title: "Default source" });
      const test = await quick(M().tutorNguyen, { learner: child, tags: [{ n: 4, tag_key: "dang-tu" }, { n: 7, tag_key: null }], source: "test", clientId: "fix-src-0002", title: "Quick test" });
      const sources = async (id: string) => (await q1<{ source: string }>("select distinct source from english.tag_marks where source_id = $1", [id])).map((r) => r.source);
      expect(await sources(dflt.id)).toEqual(["practice"]);
      expect(await sources(test.id)).toEqual(["test"]);
      expect((await q1<{ source: string }>("select source from english.results where id = $1", [test.id]))[0]?.source).toBe("test");
      expect((await queue(child)).items.find((i) => i.result_id === test.id)?.source).toBe("test");
      await tagItems(M().tutorNguyen, test.id, [{ n: 7, tag_key: "cum-dong-tu" }]);
      expect(await sources(test.id)).toEqual(["test"]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.tag_marks where source_id = $1", [test.id]))[0]?.n).toBe(2);
      const framed = await record(M().tutorNguyen, { learner: child, wrong: [1], source: "test", clientId: "fix-src-0003" });
      expect((await q1<{ source: string }>("select source from english.results where id = $1", [framed.id]))[0]?.source).toBe("test");
      await fail(record(M().tutorNguyen, { learner: child, wrong: [1], source: "practice", clientId: "fix-src-0004" }), "22023", /always a test/);
      await fail(quick(M().tutorNguyen, { learner: child, source: "exam" as never, clientId: "fix-src-0005" }), "22023");
      // the same request with another source is a different request
      await fail(quick(M().tutorNguyen, { learner: child, tags: [{ n: 4, tag_key: "dang-tu" }], source: "practice", clientId: "fix-src-0002", title: "Quick test" }), "23505");
      // the weak-point table counts the quick test as a "test" source
      const w = await weak(child);
      expect(tagOf(w, "dang-tu")?.by_source.test).toBeGreaterThanOrEqual(1);
    });

    it("the untagged queue says who recorded each result (the parent's own items are not made to wait)", async () => {
      const mine = await quick(M().parent, { learner: child, clientId: "fix-queue-0001", title: "Parent entry" });
      const item = (await queue(child)).items.find((i) => i.result_id === mine.id) as unknown as { recorded_by_member: string; recorded_role: string };
      expect(item).toMatchObject({ recorded_by_member: M().parent, recorded_role: "parent" });
    });

    it("rechecks recorded in a note that was later replaced stop counting (last_recheck and the tag list)", async () => {
      const lc = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Recheck fix', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, lc]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [lc]);
      await noteV2(M().parent, { learner: lc, date: daysAgo(20), weak: ["cum-dong-tu"], clientId: "fix-rc-note-01" });
      const ok = await noteV2(M().parent, { learner: lc, date: daysAgo(3), rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }, { tag_key: "phat-am", result: "ok" }], clientId: "fix-rc-note-02" });
      let w = await weak(lc);
      expect(tagOf(w, "cum-dong-tu")).toMatchObject({ status: "ok", last_recheck: { result: "ok" } });
      expect(tagOf(w, "phat-am")).toMatchObject({ status: "ok" }); // asked, fine: listed as ok
      // the note is replaced by one without those rechecks: the old rechecks no longer count
      await noteV2(M().parent, { learner: lc, date: daysAgo(3), studied: "Corrected", supersedes: ok.id, clientId: "fix-rc-note-03" });
      w = await weak(lc);
      expect(tagOf(w, "cum-dong-tu")).toMatchObject({ status: "watch", last_recheck: null });
      expect(tagOf(w, "phat-am")).toBeUndefined();
    });

    it("a recheck is placed by the day of the session, not by the day it was typed in", async () => {
      const lc = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Recheck date', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, lc]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [lc]);
      // typed in later, but it happened EARLIER (20 days ago): it must not hide the 10-day-old "ok"
      await noteV2(M().parent, { learner: lc, date: daysAgo(10), rechecks: [{ tag_key: "thanh-ngu", result: "ok" }], clientId: "fix-rd-note-01" });
      await noteV2(M().parent, { learner: lc, date: daysAgo(20), rechecks: [{ tag_key: "thanh-ngu", result: "still_wrong" }], clientId: "fix-rd-note-02" });
      expect(tagOf(await weak(lc), "thanh-ngu")).toMatchObject({ status: "ok", last_recheck: { result: "ok" }, last_seen: daysAgo(20) });
    });

    it("one tag cannot be both 'to reinforce' and 're-checked: ok' in the same note (still wrong is fine)", async () => {
      await fail(noteV2(M().parent, { learner: child, weak: ["dang-tu"], rechecks: [{ tag_key: "dang-tu", result: "ok" }], clientId: "fix-both-0001" }), "23514", /both to reinforce/);
      await noteV2(M().parent, { learner: child, weak: ["dang-tu"], rechecks: [{ tag_key: "dang-tu", result: "still_wrong" }], clientId: "fix-both-0002" });
      await noteV2(M().parent, { learner: child, weak: ["dang-tu"], rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }], clientId: "fix-both-0003" });
    });

    it("writing tags on a checkpoint episode are tutor-only (D15); other writing can be tagged by the parent", async () => {
      const facet = (await q1<{ cp: boolean | null; od: boolean }>("select (facets ->> 'checkpoint')::boolean as cp, observed_directly as od from english.episodes where id = $1", [ep11]))[0];
      expect(facet?.cp === true || facet?.od === true, "the fixture episode is a checkpoint").toBe(true);
      await fail(tagEpisode(M().parent, ep11, ["viet-cau"]), "42501", /D15/);
      await fail(tagEpisode(M().studentAn, ep11, ["viet-cau"]), "42501");
      expect((await tagEpisode(M().tutorAn, ep11, ["viet-cau"])).replayed).toBe(true); // already tagged by the tutor earlier
      const plain = (await q1<{ cp: boolean | null; od: boolean }>("select (facets ->> 'checkpoint')::boolean as cp, observed_directly as od from english.episodes where id = $1", [ep6]))[0];
      expect(plain?.cp === true || plain?.od === true).toBe(false);
      await tagEpisode(M().parent, ep6, ["viet-cau"]);
    });

    it("the old lesson-note form cannot replace a note written with the session form (v2)", async () => {
      const v2 = await noteV2(M().tutorNguyen, { learner: child, weak: ["dang-tu"], message: "Nhắn em", clientId: "fix-v1v2-0001" });
      const v1 = (supersedes: string | null, client: string) =>
        svc<NoteRes>("select english.eng_write_lesson_note($1, $2::date, 'Goal', null, 'light', '{}'::text[], '{}'::text[], true, $3, $4, $5) as r", [child, TODAY, supersedes, M().tutorNguyen, client]);
      await fail(v1(v2.id, "fix-v1v2-0002"), "23514", /session form/);
      // the old form still works for old notes, including editing them
      const old = await v1(null, "fix-v1v2-0003");
      expect((await v1(old.id, "fix-v1v2-0004")).replayed).toBe(false);
      // and the v2 note is untouched
      expect((await q1<{ n: number }>("select count(*)::int as n from english.lesson_notes where supersedes_id = $1", [v2.id]))[0]?.n).toBe(0);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("append-only", () => {
    it("results, tag_marks, recheck_events and test_frames cannot be updated, deleted or truncated (not even by the owner)", async () => {
      for (const table of ["results", "tag_marks", "recheck_events", "test_frames"]) {
        await expect(db.client.query(`update english.${table} set created_at = now()`), `${table} update`).rejects.toThrow(/append-only/);
        await expect(db.client.query(`delete from english.${table}`), `${table} delete`).rejects.toThrow(/append-only/);
        await expect(db.client.query(`truncate english.${table} cascade`), `${table} truncate`).rejects.toThrow(/TRUNCATE is forbidden|append-only/);
      }
      expect(await count("select count(*)::int as n from english.results")).toBeGreaterThan(0);
    });

    it("lesson_notes stays append-only after the new columns", async () => {
      await expect(db.client.query("update english.lesson_notes set message_to_learner = 'x'")).rejects.toThrow(/append-only/);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("the queries behind the screens return what the page parsers expect (and staff only)", () => {
    it("tags, frames, last result, last note, weak points and the untagged queue all parse", async () => {
      await quick(M().tutorNguyen, { tags: [{ n: 4, tag_key: "dang-tu" }, { n: 7, tag_key: null }], clientId: "screen-quick-0001" });
      await noteV2(M().tutorNguyen, { weak: ["dang-tu"], message: "Ôn dạng từ nhé", parent: "Em tiến bộ", clientId: "screen-note-00001" });
      const asStaff = (user: string, sql: string, params: unknown[] = []) => rowsAs(db.client, "authenticated", user, sql, params);

      // the same selects the loaders make (dates as text, as PostgREST returns them)
      const tags = parseTags(await asStaff(s.users.tutorNguyen, "select key, label_vi, group_vi, origin from english.error_tags where track_id = 'B' and retired_at is null order by origin desc, created_at"));
      expect(tags.length).toBeGreaterThanOrEqual(10);
      expect(tags.slice(0, 10).every((t) => !t.custom)).toBe(true);
      expect(tags.find((t) => t.key === "dang-tu")?.label).toBe("Dạng từ");

      const frames = parseFrames(await asStaff(s.users.parent, "select id, title, total_items, parts, items, scale, supersedes_id from english.test_frames where track_id = 'B' order by created_at"));
      const tiny = frames.find((f) => f.id === frameId);
      expect(tiny).toMatchObject({ title: "Tiny B test", totalItems: 10 });
      expect(tiny?.items).toHaveLength(10);
      expect(tiny?.parts[0]).toEqual({ key: "A", name: "Grammar", from: 1, to: 5 });
      expect(tiny?.scale?.[0]).toEqual({ min: 8, max: 10, label: "Tốt" });

      const recent = parseRecentResult(await asStaff(s.users.tutorNguyen, "select id, title, taken_on::text as taken_on, total_items, correct from english.results where learner_id = $1 order by taken_on desc, created_at desc limit 1", [NG()]));
      expect(recent?.takenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const lastNote = parseLastNote(await asStaff(s.users.parent, "select id, session_date::text as session_date, goals, weak_tag_keys, message_to_learner, author_role, supersedes_id from english.lesson_notes where learner_id = $1 order by session_date desc, created_at desc limit 20", [NG()]));
      expect(lastNote).toMatchObject({ message: "Ôn dạng từ nhé", weakTagKeys: ["dang-tu"], authorRole: "tutor" });

      const notes = parseNotes(await asStaff(s.users.parent, "select id, learner_id, tutor_member_id, session_date::text as session_date, goals, observed, support_level, next_actions, practised_target_ids, published, supersedes_id, created_at::text as created_at, weak_tag_keys, message_to_learner, note_for_parent, author_role from english.lesson_notes where learner_id = $1", [NG()]));
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.some((n) => n.supportLevel === null && n.noteForParent === "Em tiến bộ")).toBe(true);

      const view = parseWeakPoints(await svc("select english.eng_weak_points($1, null) as r", [NG()]));
      expect(view.policyDays).toBeGreaterThan(0);
      expect(view.tags.length).toBeGreaterThan(0);
      const queue = parseUntagged(await svc("select english.eng_untagged_queue($1) as r", [NG()]));
      expect(queue.some((i) => i.title === "Link practice" && i.items.includes(7))).toBe(true);
    });

    it("the same selects return nothing to a student", async () => {
      for (const sql of [
        "select 1 from english.error_tags",
        "select 1 from english.test_frames",
        "select 1 from english.results",
        "select 1 from english.tag_marks",
        "select 1 from english.lesson_notes",
      ]) expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, sql), sql).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("purge removes the new rows with the learner (and only that learner's)", () => {
    it("deletes results, marks, rechecks and notes of one learner, reports them in the receipt, and leaves the family's frames", async () => {
      const victim = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Purge child', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, victim]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [victim]);
      await record(M().parent, { learner: victim, wrong: [1, 6], clientId: "purge-res-0001" });
      await quick(M().parent, { learner: victim, tags: [{ n: 4, tag_key: "dang-tu" }, { n: 7, tag_key: null }], clientId: "purge-res-0002" });
      await noteV2(M().parent, { learner: victim, weak: ["dang-tu"], rechecks: [{ tag_key: "cum-dong-tu", result: "ok" }], clientId: "purge-note-001" });
      const others = [
        await count("select count(*)::int as n from english.results where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.tag_marks where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.test_frames"),
      ];
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [victim]);
      expect(receipt.deleted).toMatchObject({ results: 2, tag_marks: 4, recheck_events: 1, lesson_notes: 1 });
      for (const t of ["results", "tag_marks", "recheck_events", "lesson_notes"]) {
        expect(await count(`select count(*)::int as n from english.${t} where learner_id = $1`, [victim]), t).toBe(0);
      }
      expect([
        await count("select count(*)::int as n from english.results where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.tag_marks where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.test_frames"),
      ]).toEqual(others);
    });

    it("also removes the short login name of the learner's own (student) account, and no other name", async () => {
      const user = await createAuthUser(db.client, "purge-student@test.local");
      const member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'student', 'Purge student') returning id", [user, s.familyId]))[0] as { id: string }).id;
      const victim = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status, member_id) values ($1, 'Purge named', 'B', true, 'active', $2) returning id", [s.familyId, member]))[0] as { id: string }).id;
      await q1("insert into english.login_names(login_name, auth_user_id) values ('thu-purge-student', $1)", [user]);
      const before = await count("select count(*)::int as n from english.login_names");
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [victim]);
      expect(receipt.deleted).toMatchObject({ login_names: 1, members: 1 });
      expect(await count("select count(*)::int as n from english.login_names where login_name = 'thu-purge-student'")).toBe(0);
      expect(await count("select count(*)::int as n from english.login_names")).toBe(before - 1);
      // the name can be given again
      await q1("insert into english.login_names(login_name, auth_user_id) values ('thu-purge-student', $1)", [user]);
    });
  });
});
