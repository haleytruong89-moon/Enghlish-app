import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioContext } from "../../lib/studio/context";
import { normalizeExtract } from "../../lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "../../lib/studio/schema";
import { FAKE_EXTRACT } from "../unit/fixtures/studio";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** Findings of the Opus review of Studio B1 (frames per child, open-item answers, skills, counting, retry, instants, supersede, purge). */
describe("Studio B1 review findings (migration 0024)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = async <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asStudent = async <T = unknown>(user: string, sql: string, params: unknown[] = []) => asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
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
  /** A saved draft of Nguyên (manual), edited by `mutate`, ready to approve. */
  const newDraft = async (mutate: (d: StudioDraft) => StudioDraft) => {
    n += 1;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [s.learners.nguyen, `Bài thử ${n}`, s.members.tutorNguyen, `rv-${n}-aaaaaaaa`]);
    const base = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), await ctxOf(s.learners.nguyen));
    const withKey = { ...base, items: base.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i)) };
    const payload = mutate(withKey);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, `Bài thử ${n}`, JSON.stringify(payload), cur.updated_at, s.members.tutorNguyen]);
    return { id: made.id, payload, updatedAt: saved.updated_at };
  };
  const approve = (d: { id: string; payload: StudioDraft; updatedAt: string }, build = buildStudioBuild(d.payload)) =>
    svc<{ template_id: string; version: number; frame_id: string }>("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [d.id, d.updatedAt, JSON.stringify(build), s.members.tutorNguyen]);
  const assign = (draft: string) => {
    return svc<{ activity_id: string }>("select english.eng_assign_studio($1, current_date, current_date + 3, $2, $3) as r", [draft, s.members.parent, `as-${randomUUID()}`]);
  };
  const submit = (activity: string, answers: Record<string, string>) =>
    asStudent<{ attempt_id: string }>(s.users.studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activity, randomUUID(), JSON.stringify({ answers }), ["none"]]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("a Studio frame belongs to its child: the other child's tutor cannot read it; no other child's result or assignment may use it", async () => {
    const d = await newDraft((x) => x);
    const ok = await approve(d);
    expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select id from english.test_frames where id = $1", [ok.frame_id])).length).toBe(1);
    expect((await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.test_frames where id = $1", [ok.frame_id])).length).toBe(1);
    expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select id from english.test_frames where id = $1", [ok.frame_id])).toEqual([]);
    expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select id from english.test_frames where id = $1", [ok.frame_id])).toEqual([]);
    await fail(
      q1(
        `insert into english.results(learner_id, frame_id, mode, context, attempt, source, title, total_items, correct, wrong_items, taken_on, recorded_by_member, recorded_role, client_id)
         values ($1, $2, 'frame', 'home', 'first', 'test', 't', 9, 9, '{}', current_date, $3, 'parent', $4)`,
        [s.learners.an, ok.frame_id, s.members.parent, `fr-${randomUUID()}`],
      ),
      "23514",
      /frame_other_learner/,
    );
  });

  it("approve refuses a skill outside the child's Studio list (bad_skill)", async () => {
    const d = await newDraft((x) => x);
    const build = buildStudioBuild(d.payload);
    const bad = { ...build, template: { ...build.template, target_ids: [...build.template.target_ids, "A-T1-TEXT-R"] } };
    await fail(approve(d, bad), "22023", /\(bad_skill\)/);
  });

  it("the child never sees the model answer of an open item marked Sai; the explanation stays", async () => {
    const d = await newDraft((x) => ({
      ...x,
      items: x.items.map((i) => (i.n === 9 ? { ...i, out_of_app: false, kind: "open", key: "A MODEL ANSWER", explanation_vi: "Viết một câu về bức tranh." } : i)),
    }));
    await approve(d);
    const act = await assign(d.id);
    const att = await submit(act.activity_id, { q1: "B. had", q2: "A. must", q3: "A. off", q4: "C. A visit that changed Lan's plans", q5: "B. The robot room was interesting", q6: "happiness", q7: "I wish I could", q8: "is said to be", q9: "I see a cat" });
    await svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, $4) as r", [att.attempt_id, JSON.stringify([{ item_id: "q9", result: "incorrect" }]), s.members.tutorNguyen, `dc-${randomUUID()}`]);
    const review = await asStudent<{ wrong: { n: number; expected: string | null; explanation_vi: string | null }[] }>(s.users.studentNguyen, "select english.eng_my_studio_review($1) as r", [act.activity_id]);
    expect(review.wrong).toEqual([expect.objectContaining({ n: 9, expected: null, explanation_vi: "Viết một câu về bức tranh." })]);
    expect(JSON.stringify(review)).not.toContain("A MODEL ANSWER");
  });

  it("'correct' is counted from correct results only: an app item with no check result is not counted correct", async () => {
    const d = await newDraft((x) => x);
    const build = buildStudioBuild(d.payload);
    // the frame says item 9 is done in the app, but the step has no such item: nothing checks it
    const odd = { ...build, meta: build.meta.map((m) => (m.n === 9 ? { ...m, out_of_app: false } : m)) };
    await approve(d, odd);
    const act = await assign(d.id);
    const att = await submit(act.activity_id, { q1: "B. had", q2: "A. must", q3: "A. off", q4: "C. A visit that changed Lan's plans", q5: "B. The robot room was interesting", q6: "happiness", q7: "I wish I could", q8: "is said to be" });
    await svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, $4) as r", [att.attempt_id, JSON.stringify([{ item_id: "q7", result: "correct" }]), s.members.tutorNguyen, `dc-${randomUUID()}`]);
    expect((await q1("select correct, wrong_items, not_in_app_items from english.results where attempt_id = $1", [att.attempt_id]))[0]).toEqual({ correct: 8, wrong_items: [], not_in_app_items: [9] });
  });

  it("a result that failed to write is written when the inbox is opened (retry), once", async () => {
    const d = await newDraft((x) => ({ ...x, items: x.items.filter((i) => i.n <= 4).map((i) => ({ ...i })) }));
    await approve(d);
    const act = await assign(d.id);
    await q1("alter table english.episodes disable trigger episodes_studio_result");
    let att: { attempt_id: string };
    try {
      att = await submit(act.activity_id, { q1: "B. had", q2: "A. must", q3: "A. off", q4: "C. A visit that changed Lan's plans" });
    } finally {
      await q1("alter table english.episodes enable trigger episodes_studio_result");
    }
    expect(await q1("select 1 from english.results where attempt_id = $1", [att.attempt_id])).toEqual([]);
    await fail(svc("select english.eng_studio_retry_results($1) as r", [null]), "22004");
    expect(await svc<number>("select english.eng_studio_retry_results($1) as r", [s.members.tutorAn])).toBe(0); // not this tutor's child
    expect(await svc<number>("select english.eng_studio_retry_results($1) as r", [s.members.tutorNguyen])).toBe(1);
    expect((await q1("select correct from english.results where attempt_id = $1", [att.attempt_id]))[0]).toEqual({ correct: 4 });
    expect(await svc<number>("select english.eng_studio_retry_results($1) as r", [s.members.tutorNguyen])).toBe(0);
  });

  it("the optimistic lock compares instants: a base written in another TimeZone still matches; a stale one does not", async () => {
    const d = await newDraft((x) => x);
    const read = async (tz: string) => {
      await db.client.query(`set time zone '${tz}'`);
      try {
        return (await db.client.query<{ r: { updated_at: string } }>("select english.eng_studio_draft($1) as r", [d.id])).rows[0]!.r.updated_at;
      } finally {
        await db.client.query("reset time zone");
      }
    };
    const utc = await read("UTC");
    const vn = await read("Asia/Ho_Chi_Minh");
    expect(vn).not.toBe(utc);
    await db.client.query("set time zone 'America/New_York'");
    try {
      const saved = await db.client.query<{ r: { updated_at: string } }>("select english.eng_save_studio_draft($1, 'Lock test', $2::jsonb, $3, $4) as r", [d.id, JSON.stringify(d.payload), vn, s.members.tutorNguyen]);
      expect(saved.rows[0]!.r.updated_at).toBeTruthy();
    } finally {
      await db.client.query("reset time zone");
    }
    await fail(svc("select english.eng_save_studio_draft($1, 'Lock test', $2::jsonb, $3, $4) as r", [d.id, JSON.stringify(d.payload), utc, s.members.tutorNguyen]), "23505", /\(draft_changed\)/);
  });

  it("a version that a newer approved version replaced cannot be assigned (superseded); the newer one can", async () => {
    const d = await newDraft((x) => x);
    await approve(d);
    const e = await svc<{ id: string }>("select english.eng_edit_studio_draft($1, $2, $3) as r", [d.id, s.members.tutorNguyen, `ed-${randomUUID()}`]);
    const cur = await svc<{ payload: StudioDraft; updated_at: string }>("select english.eng_studio_draft($1) as r", [e.id]);
    await approve({ id: e.id, payload: cur.payload, updatedAt: cur.updated_at });
    await fail(assign(d.id), "23514", /\(superseded\)/);
    expect((await assign(e.id)).activity_id).toBeTruthy();
  });

  it("purge removes the child's Studio frames; the dry run counts the same key", async () => {
    const before = (await q1<{ n: number }>("select count(*)::int as n from english.test_frames where learner_id = $1", [s.learners.nguyen]))[0]!.n;
    expect(before).toBeGreaterThan(0);
    const preview = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [s.learners.nguyen]);
    expect(preview.counts.studio_frames).toBe(before);
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [s.learners.nguyen]);
    expect(receipt.deleted.studio_frames).toBe(before);
    expect((await q1<{ n: number }>("select count(*)::int as n from english.test_frames where learner_id is not null"))[0]!.n).toBe(0);
  });
});
