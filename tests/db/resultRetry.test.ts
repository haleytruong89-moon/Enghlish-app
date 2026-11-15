import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioContext } from "../../lib/studio/context";
import { normalizeExtract } from "../../lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "../../lib/studio/schema";
import { FAKE_EXTRACT } from "../unit/fixtures/studio";
import { asCommit, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** W4c2 · the screen after submitting (no score, no answer), one retry per item, the "Bài kiểm tra" flag (migration 0034). One database. */
describe("result view, retry and test flag (migration 0034)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = async <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = async <T = unknown>(user: string, sql: string, params: unknown[] = []) => asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const ctxOf = async (learner: string): Promise<StudioContext> => {
    const tags = await q1<{ key: string; label: string; group_vi: string | null; related: string[] | null }>(
      `select t.key, t.label_vi as label, t.group_vi,
              (select sl.related from english.skill_leaves sl where sl.kind = 'tag' and sl.track_id = t.track_id and sl.ref_key = t.key limit 1) as related
       from english.error_tags t join english.learners l on l.track_id = t.track_id where l.id = $1 and t.retired_at is null`,
      [learner],
    );
    const skills = (await q1<{ s: { id: string; title_vi: string }[] }>("select english.eng_studio_skills($1) as s", [learner]))[0]!.s;
    return {
      tags: tags.map((t) => ({ key: t.key, label: t.label, reading: t.group_vi === "Kỹ năng đọc", near: true, related: t.related ?? [], group: t.group_vi })),
      skills: skills.map((x) => ({ id: x.id, label: x.title_vi })),
    };
  };
  let n = 0;
  /** An approved Studio test of Nguyên (8 closed items + q9 on paper), assigned with or without the test flag. */
  const newWork = async (test: boolean) => {
    n += 1;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [s.learners.nguyen, `Bài thử ${n}`, s.members.tutorNguyen, `rr-${n}-aaaaaaaa`]);
    const base = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), await ctxOf(s.learners.nguyen));
    const payload: StudioDraft = { ...base, items: base.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i)) };
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, `Bài thử ${n}`, JSON.stringify(payload), cur.updated_at, s.members.tutorNguyen]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(payload)), s.members.tutorNguyen]);
    const a = await svc<{ activity_id: string }>("select english.eng_assign_studio_v2($1, current_date, current_date + 3, $2, $3, $4) as r", [made.id, test, s.members.parent, `as-${randomUUID()}`]);
    return a.activity_id;
  };
  const WRONG = { q1: "B. had", q2: "B. can't", q3: "A. off", q4: "C. A visit that changed Lan's plans", q6: "happyness", q7: "I wish I could", q8: "is said to be a" };
  const submit = (activity: string, answers: Record<string, string> = WRONG, user = s.users.studentNguyen) =>
    asUser<{ attempt_id: string }>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activity, randomUUID(), JSON.stringify({ answers }), ["none"]]);
  type View = { attempt_no: number; is_test: boolean; others_fine: boolean; look: { id: string; n: number; stem: string; given: string; retry: { text: string } | null; can_retry: boolean }[]; open: { n: number }[] };
  const view = (activity: string, user = s.users.studentNguyen) => asUser<View | null>(user, "select english.eng_my_result_view($1) as r", [activity]);
  const retry = (activity: string, item: string, answer: string, clientId: string = randomUUID(), user = s.users.studentNguyen) =>
    asUser<{ id: string; replayed: boolean }>(user, "select english.eng_my_retry_item($1, $2, $3, $4) as r", [activity, item, answer, clientId]);
  const noNow = (x: unknown) => ({ ...(x as object), now: undefined });
  const inputs = async () => ({
    engine: noNow(await svc("select english.eng_engine_inputs($1, null) as r", [s.learners.nguyen])),
    points: noNow(await svc("select english.eng_point_inputs($1, null) as r", [s.learners.nguyen])),
  });

  let practice: string;
  let test: string;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    practice = await newWork(false);
    test = await newWork(true);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("the result view", () => {
    it("is null before the first submit and for the other child", async () => {
      expect(await view(practice)).toBeNull();
      await submit(practice);
      expect(await view(practice, s.users.studentAn)).toBeNull();
    });

    it("lists the items to look at again, the open ones and one 'rest is fine' flag - never a model answer, an explanation, a count or a score", async () => {
      const v = (await view(practice))!;
      expect(v.look.map((x) => [x.n, x.id, x.given])).toEqual([[2, "q2", "B. can't"], [5, "q5", ""], [6, "q6", "happyness"]]);
      expect(v.open.map((x) => x.n)).toEqual([7, 8]);
      expect(v.others_fine).toBe(true);
      expect(v.is_test).toBe(false);
      expect(v.look.every((x) => x.can_retry && x.retry === null)).toBe(true);
      // keys: only these may exist anywhere in the JSON
      const keys = new Set<string>();
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") for (const [k, val] of Object.entries(x)) { keys.add(k); walk(val); }
      };
      walk(v);
      expect([...keys].sort()).toEqual(["attempt_no", "can_retry", "given", "id", "is_test", "look", "n", "open", "others_fine", "retry", "stem", "submitted_at", "text"].filter((k) => k !== "text" || keys.has("text")).sort());
      expect(JSON.stringify(v)).not.toMatch(/"(score|correct|expected|answer|explanation|explanation_vi|tag_key|level_num|pct|result|total|checked)"/);
      // the printed answers of the key never appear
      expect(JSON.stringify(v)).not.toContain("A. must");
      expect(JSON.stringify(v)).not.toContain("happiness");
    });

    it("anon and service_role cannot call it; neither can the child call the old eng_my_studio_review any more", async () => {
      expect((await errorAs(db.client, "anon", null, "select english.eng_my_result_view($1)", [practice]))?.code).toBe("42501");
      expect((await errorAs(db.client, "service_role", null, "select english.eng_my_result_view($1)", [practice]))?.code).toBe("42501");
      expect((await errorAs(db.client, "authenticated", s.users.studentNguyen, "select english.eng_my_studio_review($1)", [practice]))?.code).toBe("42501");
    });
  });

  describe("one retry per item", () => {
    it("a wrong or blank item takes one retry; the view then shows it and no more retry", async () => {
      await retry(practice, "q2", "A. must", "retry-q2-aaaa");
      await retry(practice, "q5", "B. The robot room was interesting");
      const v = (await view(practice))!;
      expect(v.look.find((x) => x.n === 2)).toMatchObject({ retry: { text: "A. must" }, can_retry: false });
      expect(v.look.find((x) => x.n === 6)).toMatchObject({ retry: null, can_retry: true });
    });

    it("the same client id with the same content is a replay; with other content it is refused", async () => {
      expect((await retry(practice, "q2", "A. must", "retry-q2-aaaa")).replayed).toBe(true);
      await fail(retry(practice, "q2", "something else", "retry-q2-aaaa"), "23505", /\(client_id_reused\)/);
      expect(await q1("select 1 from english.item_retries where learner_id = $1", [s.learners.nguyen])).toHaveLength(2);
    });

    it("a second retry of the same item, a right item, an unknown item, an empty or long answer, another child's work and a not-yet-sent work are all refused", async () => {
      await fail(retry(practice, "q2", "B. can't"), "23505", /\(already_retried\)/);
      await fail(retry(practice, "q1", "B. had"), "23514", /\(not_retryable\)/);
      await fail(retry(practice, "q7", "x"), "23514", /\(not_retryable\)/); // waiting for a person: not a wrong item yet
      await fail(retry(practice, "q99", "x"), "22023", /\(bad_item\)/);
      await fail(retry(practice, "q6", "   "), "22023", /\(bad_answer\)/);
      await fail(retry(practice, "q6", "x".repeat(501)), "22023", /\(bad_answer\)/);
      await fail(retry(practice, "q6", "happiness", randomUUID(), s.users.studentAn), "P0002");
      const fresh = await newWork(false);
      await fail(retry(fresh, "q2", "A. must"), "23514", /\(not_sent\)/);
      for (const u of [s.users.parent, s.users.tutorNguyen]) await fail(retry(practice, "q6", "happiness", randomUUID(), u), "42501");
    });

    it("the person's verdict counts: an open item the adult marked Sai can be retried; one marked Đúng cannot", async () => {
      const att = await q1<{ id: string }>("select id from english.attempts where activity_instance_id = $1 order by attempt_no desc limit 1", [practice]);
      await svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, $4) as r", [att[0]!.id, JSON.stringify([{ item_id: "q7", result: "incorrect" }, { item_id: "q8", result: "correct" }]), s.members.tutorNguyen, `dc-${randomUUID()}`]);
      const v = (await view(practice))!;
      expect(v.look.map((x) => x.n)).toEqual([2, 5, 6, 7]);
      expect(v.open).toEqual([]);
      await retry(practice, "q7", "I wish I could swim");
      await fail(retry(practice, "q8", "x"), "23514", /\(not_retryable\)/);
    });

    it("only the NEWEST attempt: after a second attempt the earlier retries are not shown and the items are open again", async () => {
      await submit(practice, { ...WRONG, q2: "B. can't", q5: "", q6: "happiness" });
      const v = (await view(practice))!;
      expect(v.attempt_no).toBe(2);
      expect(v.look.map((x) => x.n)).toEqual([2, 5]);
      expect(v.look.every((x) => x.retry === null && x.can_retry)).toBe(true);
      await retry(practice, "q2", "A. must"); // allowed again: it is another attempt
    });

    it("the retry is not evidence: the inputs of the engines do not change", async () => {
      const before = await inputs();
      await retry(practice, "q5", "B. The robot room was interesting");
      expect(await inputs()).toEqual(before);
    });

    it("the other child's adults read the retries only through the service role; a student sees no row of the tables", async () => {
      expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select 1 from english.item_retries")).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select 1 from english.work_test_marks")).toEqual([]);
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select 1 from english.item_retries")).length).toBeGreaterThan(0);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select 1 from english.item_retries")).toEqual([]);
      const list = await svc<{ item_id: string; retry: string; stem: string; given: string; title: string }[]>("select english.eng_item_retries($1) as r", [s.learners.nguyen]);
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list[0]).toMatchObject({ item_id: expect.stringMatching(/^q\d$/), retry: expect.any(String), stem: expect.any(String) });
      expect(await svc("select english.eng_item_retries($1) as r", [s.learners.an])).toEqual([]);
      expect((await errorAs(db.client, "authenticated", s.users.tutorNguyen, "select english.eng_item_retries($1)", [s.learners.nguyen]))?.code).toBe("42501");
    });

    it("append-only", async () => {
      await fail(q1("update english.item_retries set answer = 'x'"), "42501");
      await fail(q1("delete from english.item_retries"), "42501");
      await fail(q1("truncate english.item_retries"), "42501");
      await fail(q1("update english.work_test_marks set is_test = false"), "42501");
      await fail(q1("truncate english.work_test_marks"), "42501");
    });
  });

  describe("the test flag", () => {
    it("a flagged work shows 'test', has no retry and refuses one", async () => {
      await submit(test);
      const v = (await view(test))!;
      expect(v.is_test).toBe(true);
      expect(v.look.length).toBe(3);
      expect(v.look.every((x) => !x.can_retry && x.retry === null)).toBe(true);
      await fail(retry(test, "q2", "A. must"), "23514", /\(test_no_retry\)/);
    });

    it("the flag changes nothing for the engines: same mode, same results, same inputs shape", async () => {
      expect((await q1<{ mode: string }>("select mode from english.activity_instances where id = any($1)", [[practice, test]])).map((r) => r.mode)).toEqual(["PRACTICE", "PRACTICE"]);
      expect((await q1<{ mode: string }>("select distinct mode from english.attempts where activity_instance_id = $1", [test])).map((r) => r.mode)).toEqual(["PRACTICE"]);
    });

    it("eng_my_test_marks gives the child their own flagged work (and bước INDEPENDENT_CHECK), nothing of the other child", async () => {
      const mine = await asUser<{ activity_ids: string[]; assignment_ids: string[] }>(s.users.studentNguyen, "select english.eng_my_test_marks() as r");
      expect(mine.activity_ids).toContain(test);
      expect(mine.activity_ids).not.toContain(practice);
      const an = await asUser<{ activity_ids: string[]; assignment_ids: string[] }>(s.users.studentAn, "select english.eng_my_test_marks() as r");
      expect(an.activity_ids).not.toContain(test);
      expect((await errorAs(db.client, "service_role", null, "select english.eng_my_test_marks()"))?.code).toBe("42501");
      expect(JSON.stringify(mine)).not.toMatch(/by_|client|learner/);
    });

    it("eng_set_test_mark: only before the first submit, only staff of the child, replayable by client id", async () => {
      const w = await newWork(false);
      const set = (is: boolean, by: string, cid: string, kind = "activity", ref = w) => svc<{ is_test: boolean; replayed: boolean }>("select english.eng_set_test_mark($1, $2, $3, $4, $5) as r", [kind, ref, is, by, cid]);
      await fail(set(true, s.members.tutorAn, "mark-0000-0001"), "42501");
      await fail(set(true, s.members.studentNguyen, "mark-0000-0002"), "42501");
      expect(await set(true, s.members.tutorNguyen, "mark-0000-0003")).toMatchObject({ is_test: true, replayed: false });
      expect((await set(true, s.members.tutorNguyen, "mark-0000-0003")).replayed).toBe(true);
      await fail(set(false, s.members.tutorNguyen, "mark-0000-0003"), "23505", /\(client_id_reused\)/);
      expect((await asUser<{ activity_ids: string[] }>(s.users.studentNguyen, "select english.eng_my_test_marks() as r")).activity_ids).toContain(w);
      expect(await set(false, s.members.parent, "mark-0000-0004")).toMatchObject({ is_test: false }); // the newest wins
      expect((await asUser<{ activity_ids: string[] }>(s.users.studentNguyen, "select english.eng_my_test_marks() as r")).activity_ids).not.toContain(w);
      await fail(svc("select english.eng_set_test_mark('nope', $1, true, $2, 'mark-0000-0005') as r", [w, s.members.parent]), "22023", /\(bad_kind\)/);
      await fail(svc("select english.eng_set_test_mark('activity', $1, true, $2, 'mark-0000-0006') as r", [randomUUID(), s.members.parent]), "42501"); // not found = not yours (no oracle)
      await submit(w);
      await fail(set(true, s.members.tutorNguyen, "mark-0000-0007"), "23514", /\(already_started\)/);
      expect((await errorAs(db.client, "authenticated", s.users.parent, "select english.eng_set_test_mark('activity', $1, true, $2, 'mark-0000-0008')", [w, s.members.parent]))?.code).toBe("42501");
    });

    it("link / PDF work: the flag goes in with the assignment (v3), before the first submission only", async () => {
      const mk = (is: boolean) =>
        svc<{ id: string }>("select english.eng_create_assignment_v3($1, 'link', 'https://www.test-english.com/x', 'Bài link', '{}'::text[], null, null, null, $2, $3, '[]'::jsonb, $4) as r", [s.learners.nguyen, s.members.tutorNguyen, `ln-${randomUUID()}`, is]);
      const t = await mk(true);
      const p = await mk(false);
      const mine = await asUser<{ assignment_ids: string[] }>(s.users.studentNguyen, "select english.eng_my_test_marks() as r");
      expect(mine.assignment_ids).toContain(t.id);
      expect(mine.assignment_ids).not.toContain(p.id);
      await svc("select english.eng_submit_practice_v2($1, $2, $3, 'first', false, 'https://x.example/r', '[]'::jsonb) as r", [t.id, s.members.studentNguyen, randomUUID()]).catch(() => null);
      const submitted = await q1("select 1 from english.submissions where assignment_id = $1", [t.id]);
      if (submitted.length > 0) await fail(svc("select english.eng_set_test_mark('assignment', $1, false, $2, 'mark-0000-0010') as r", [t.id, s.members.tutorNguyen]), "23514", /\(already_started\)/);
      // another child's tutor cannot flag it
      await fail(svc("select english.eng_set_test_mark('assignment', $1, true, $2, 'mark-0000-0011') as r", [p.id, s.members.tutorAn]), "42501");
    });

    it("assign v2 replay does not add a second mark", async () => {
      const before = (await q1<{ n: number }>("select count(*)::int as n from english.work_test_marks"))[0]!.n;
      const d = (await q1<{ id: string }>("select id from english.studio_drafts where status = 'approved' order by created_at desc limit 1"))[0]!.id;
      const cid = `as-${randomUUID()}`;
      const a = await svc<{ replayed: boolean }>("select english.eng_assign_studio_v2($1, current_date, current_date + 3, true, $2, $3) as r", [d, s.members.parent, cid]);
      const b = await svc<{ replayed: boolean }>("select english.eng_assign_studio_v2($1, current_date, current_date + 3, true, $2, $3) as r", [d, s.members.parent, cid]);
      expect([a.replayed, b.replayed]).toEqual([false, true]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.work_test_marks"))[0]!.n).toBe(before + 1);
    });

    it("replay with another kind of work is client_id_reused (Studio v2 and link v3 alike); the same kind replays", async () => {
      const d = (await q1<{ id: string }>("select id from english.studio_drafts where status = 'approved' order by created_at desc limit 1"))[0]!.id;
      const cid = `as-${randomUUID()}`;
      const go = (is: boolean) => svc("select english.eng_assign_studio_v2($1, current_date, current_date + 3, $2, $3, $4) as r", [d, is, s.members.parent, cid]);
      await go(false);
      await fail(go(true), "23505", /\(client_id_reused\)/);
      await go(false);
      const cid2 = `as-${randomUUID()}`;
      const go2 = (is: boolean) => svc("select english.eng_assign_studio_v2($1, current_date, current_date + 3, $2, $3, $4) as r", [d, is, s.members.parent, cid2]);
      await go2(true);
      await fail(go2(false), "23505", /\(client_id_reused\)/);
      const mk = (cid3: string, is: boolean) =>
        svc("select english.eng_create_assignment_v3($1, 'link', 'https://www.test-english.com/y', 'Bài link', '{}'::text[], null, null, null, $2, $3, '[]'::jsonb, $4) as r", [s.learners.nguyen, s.members.tutorNguyen, cid3, is]);
      const l1 = `ln-${randomUUID()}`;
      await mk(l1, false);
      await fail(mk(l1, true), "23505", /\(client_id_reused\)/);
      await mk(l1, false);
      const l2 = `ln-${randomUUID()}`;
      await mk(l2, true);
      await fail(mk(l2, false), "23505", /\(client_id_reused\)/);
      await mk(l2, true);
    });
  });

  describe("the adult read of retries (eng_retry_pending) and when a retry stops waiting", () => {
    const pending = (by: string, allowReal = false) =>
      svc<{ count: number; items: { attempt_id: string; learner_id: string; since: string; retries: { item_id: string; n: number; stem: string; given: string; retry: string }[] }[] }>(
        "select english.eng_retry_pending($1, $2) as r", [by, allowReal]);
    const mineOf = async (by: string, activity: string) => {
      const att = (await q1<{ id: string }>("select id from english.attempts where activity_instance_id = $1 order by attempt_no desc limit 1", [activity]))[0]!.id;
      return { att, row: (await pending(by)).items.find((i) => i.attempt_id === att) };
    };
    const fresh = async () => {
      const w = await newWork(false);
      await submit(w);
      await retry(w, "q2", "A. must");
      await retry(w, "q6", "happiness");
      return w;
    };

    it("shows the retried items beside the original answer and counts them", async () => {
      const w = await fresh();
      const { row } = await mineOf(s.members.tutorNguyen, w);
      expect(row?.retries.map((r) => [r.n, r.given, r.retry])).toEqual([[2, "B. can't", "A. must"], [6, "happyness", "happiness"]]);
      expect(row?.retries[0]!.stem).toEqual(expect.any(String));
      expect((await mineOf(s.members.parent, w)).row).toBeDefined();
    });

    it("another child's tutor sees nothing; a real learner needs allow_real; a student cannot read it", async () => {
      const w = await fresh();
      expect((await mineOf(s.members.tutorAn, w)).row).toBeUndefined();
      await db.client.query("update english.learners set is_test = false where id = $1", [s.learners.nguyen]);
      try {
        expect((await mineOf(s.members.tutorNguyen, w)).row).toBeUndefined();
        expect((await pending(s.members.tutorNguyen, true)).items.some((i) => i.learner_id === s.learners.nguyen)).toBe(true);
      } finally {
        await db.client.query("update english.learners set is_test = true where id = $1", [s.learners.nguyen]);
      }
      expect((await errorAs(db.client, "authenticated", s.users.tutorNguyen, "select english.eng_retry_pending($1, true)", [s.members.tutorNguyen]))?.code).toBe("42501");
    });

    it("clears after a LATER feedback note on the attempt, but not after one that came before the retry", async () => {
      // eng_write_feedback only accepts writing work, so the note rows are inserted directly (same shape the function writes).
      const note = (att: string, text: string, kind = "feedback") => q1(
        `insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, author_member, author_role, client_id)
         values ($1, $2, $2, 1, $5, 'Bạn làm tốt', $3::jsonb, $4, 'tutor', $6)`,
        [s.learners.nguyen, att, JSON.stringify([{ n: 1, text }]), s.members.tutorNguyen, kind, `fb-${randomUUID()}`]);
      const w = await newWork(false);
      await submit(w);
      const att = (await q1<{ id: string }>("select id from english.attempts where activity_instance_id = $1", [w]))[0]!.id;
      await note(att, "Xem lại câu 2");
      await retry(w, "q2", "A. must");
      expect((await mineOf(s.members.tutorNguyen, w)).row?.retries).toHaveLength(1);
      await q1(
        `insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, supersedes_id, author_member, author_role, client_id)
         values ($1, $2, $2, 1, 'feedback', 'Tốt hơn', $3::jsonb, (select id from english.feedback_notes where source_attempt_id = $2 and supersedes_id is null), $4, 'tutor', $5)`,
        [s.learners.nguyen, att, JSON.stringify([{ n: 1, text: "Câu 2 ổn rồi" }]), s.members.tutorNguyen, `fb-${randomUUID()}`]);
      expect((await mineOf(s.members.tutorNguyen, w)).row).toBeUndefined();
    });

    it("clears after a later item decision", async () => {
      const w = await fresh();
      const { att } = await mineOf(s.members.tutorNguyen, w);
      await svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, $4) as r", [att, JSON.stringify([{ item_id: "q7", result: "incorrect" }]), s.members.tutorNguyen, `dc-${randomUUID()}`]);
      expect((await mineOf(s.members.tutorNguyen, w)).row).toBeUndefined();
    });

    it("clears after a later recorded result and after a later validation decision; a new retry after that waits again", async () => {
      const w = await fresh();
      const { att } = await mineOf(s.members.tutorNguyen, w);
      await q1(`insert into english.results(learner_id, mode, context, attempt, source, title, total_items, correct, wrong_items, taken_on, recorded_by_member, recorded_role, client_id, attempt_id)
                values ($1, 'quick', 'home', 'first', 'practice', 'Kết quả thử', 1, 1, '{}', current_date, $2, 'tutor', $3, $4)`, [s.learners.nguyen, s.members.tutorNguyen, `rs-${randomUUID()}`, att]);
      expect((await mineOf(s.members.tutorNguyen, w)).row).toBeUndefined();

      const w2 = await fresh();
      const { att: att2 } = await mineOf(s.members.tutorNguyen, w2);
      const ep = (await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [att2]))[0]!.id;
      await q1(`insert into english.validation_decisions(episode_id, learner_id, target_key, decision, validator_member_id, validator_role)
                values ($1, $2, 'T-RETRY-TEST', 'INSUFFICIENT', $3, 'tutor')`, [ep, s.learners.nguyen, s.members.tutorNguyen]);
      expect((await mineOf(s.members.tutorNguyen, w2)).row).toBeUndefined();
    });

    it("a retry of the NEXT attempt is a new row", async () => {
      const w = await fresh();
      await submit(w, { ...WRONG, q2: "B. can't" });
      expect((await mineOf(s.members.tutorNguyen, w)).row).toBeUndefined();
      await retry(w, "q2", "A. must");
      expect((await mineOf(s.members.tutorNguyen, w)).row?.retries).toHaveLength(1);
    });
  });

  describe("purge", () => {
    it("the dry run and the receipt count both new tables with the same keys; afterwards there are no rows", async () => {
      const L = s.learners.nguyen;
      const retries = (await q1<{ n: number }>("select count(*)::int as n from english.item_retries where learner_id = $1", [L]))[0]!.n;
      const marks = (await q1<{ n: number }>("select count(*)::int as n from english.work_test_marks where learner_id = $1", [L]))[0]!.n;
      expect(retries).toBeGreaterThan(0);
      expect(marks).toBeGreaterThan(0);
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts).toMatchObject({ item_retries: retries, work_test_marks: marks });
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toMatchObject({ item_retries: retries, work_test_marks: marks });
      expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
      expect((await q1<{ n: number }>("select count(*)::int as n from english.item_retries where learner_id = $1", [L]))[0]!.n).toBe(0);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.work_test_marks where learner_id = $1", [L]))[0]!.n).toBe(0);
    });
  });
});
