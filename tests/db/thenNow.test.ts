import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import { as, asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate => JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
const FORBIDDEN_KEY = /^(score|scores|correct|expected|answer|answers|explanation|explanation_vi|tag_key|tag_keys|level_num|pct|percent|result|results|wrong|wrong_items|rubric|verdict|decision|state|kind|conditions|evidence)$/;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

/** W4e (migration 0036): "Ngày ấy – bây giờ" — the tutor picks two pieces of the child's own writing; the child reads them. One database. */
describe("then-now picks (migration 0036)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const read = <T = unknown>(user: string, sql: string, params: unknown[] = []) => as(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  type Pair = { then: { on: string; text: string }; now: { on: string; text: string }; note: string | null };
  const mine = (user: string) => read<Pair | null>(user, "select english.eng_my_then_now() as r");
  const pick = (by: string, thenId: string, nowId: string, o: { learner?: string; note?: string | null; status?: string; clientId?: string } = {}) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_pick_then_now($1, $2, $3, $4, $5, $6, $7) as r", [o.learner ?? NG(), thenId, nowId, o.note ?? null, o.status ?? "shown", by, o.clientId ?? randomUUID()]);
  type Cands = { candidates: { id: string; at: string; title: string | null; preview: string }[]; current: { id: string; then_attempt: string; now_attempt: string; note: string | null; status: string } | null };
  const candidates = (learner = NG()) => svc<Cands>("select english.eng_then_now_candidates($1) as r", [learner]);

  // ---- pieces of writing, written straight as the table owner (the app writes through eng_submit_attempt; the day is what the tests need to control)
  let writeNg: string; // Nguyên, an ACT-WRITE step (B-W1 step 7)
  let otherStepNg: string; // Nguyên, a step that is not writing
  let writeAn: string;
  let attemptNo = 0;
  const attempt = async (activity: string, learner: string, o: { daysAgo: number; provenance?: string; text?: string | null; member?: string; kind?: "text" | "answers" }) => {
    attemptNo += 1;
    const id = randomUUID();
    const first = (await q1<{ id: string; learning_family_id: string; mode: string }>("select id, learning_family_id, mode from english.attempts where activity_instance_id = $1 order by attempt_no limit 1", [activity]))[0];
    const provenance = o.provenance ?? "in_app";
    const extra = provenance === "imported" ? ", taken_on, support_level" : "";
    const extraV = provenance === "imported" ? ", current_date, 'tu_lam'" : "";
    const no = (await q1<{ n: number }>("select coalesce(max(attempt_no), 0)::int + 1 as n from english.attempts where activity_instance_id = $1", [activity]))[0]!.n;
    await q1(
      `insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance, declared_assistance, submitted_at, content_hash, client_submission_id${extra})
       values ($1, $2, $3, $4, $5, $6, $7, $8, array['none'], now() - ($9 || ' days')::interval, repeat('b', 64), $10${extraV})`,
      [id, activity, learner, no, first?.id ?? null, first?.learning_family_id ?? id, first?.mode ?? "PRACTICE", provenance, String(o.daysAgo), randomUUID()],
    );
    // attempt_no = 1 must be its own family: fix by selecting the family after insert when first is null
    if (o.text !== null) {
      await q1("insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by) values ($1, $2, $3, 1, $4::jsonb, true, $5)", [
        id, learner, o.kind ?? "text", JSON.stringify(o.kind === "answers" ? { answers: {} } : { text: o.text ?? `Piece ${attemptNo}` }), o.member ?? M().studentNguyen,
      ]);
    }
    return id;
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const assign = async (who: "an" | "nguyen", tpl: string) =>
      (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, dueReleasingAll(tpl), M().parent, `w4e-${tpl}-${who}`]))[0]!.id;
    const ngInst = await assign("nguyen", "B-W1-HOMEWORK");
    const anInst = await assign("an", "A-W1-VOLCANOES");
    const stepOf = async (inst: string, no: number) => (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [inst, no]))[0]!.id;
    writeNg = await stepOf(ngInst, 7);
    writeAn = await stepOf(anInst, 6);
    otherStepNg = (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and activity_type <> 'ACT-WRITE' order by step_no limit 1", [ngInst]))[0]!.id;
    expect((await q1<{ activity_type: string }>("select activity_type from english.activity_instances where id = $1", [writeNg]))[0]!.activity_type).toBe("ACT-WRITE");
    expect((await q1<{ activity_type: string }>("select activity_type from english.activity_instances where id = $1", [writeAn]))[0]!.activity_type).toBe("ACT-WRITE");
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the table is append-only (even service_role cannot write or truncate), has RLS, and only the child's adults read it", async () => {
    const a = await attempt(writeNg, NG(), { daysAgo: 60, text: "I like cat." });
    const b = await attempt(writeNg, NG(), { daysAgo: 3, text: "Technology is useful if we use it wisely." });
    await fail(svc("insert into english.then_now_picks(learner_id, then_attempt_id, now_attempt_id, status, by_member, by_role, client_id) values ($1,$2,$3,'shown',$4,'tutor','abcdefgh1') returning 1 as r", [NG(), a, b, M().tutorNguyen]), "42501");
    const p = await pick(M().tutorNguyen, a, b);
    await fail(q1("update english.then_now_picks set note = 'x' where id = $1", [p.id]), "42501");
    await fail(q1("delete from english.then_now_picks where id = $1", [p.id]), "42501");
    await fail(svc("truncate english.then_now_picks"), "42501");
    expect((await q1<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'english.then_now_picks'::regclass"))[0]!.relrowsecurity).toBe(true);
    const ids = async (user: string) => (await rowsAs<{ id: string }>(db.client, "authenticated", user, "select id from english.then_now_picks where id = $1", [p.id])).length;
    expect(await ids(U().tutorNguyen)).toBe(1);
    expect(await ids(U().parent)).toBe(1);
    expect(await ids(U().tutorAn)).toBe(0);
    expect(await ids(U().studentNguyen)).toBe(0);
    expect(await ids(U().studentAn)).toBe(0);
  });

  it("only the right role calls each function", async () => {
    for (const sql of ["select english.eng_my_levels()", "select english.eng_my_cando()", "select english.eng_my_then_now()"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql)), "42501");
    }
    for (const sql of ["select english.eng_pick_then_now(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), null, 'shown', gen_random_uuid(), 'abcdefgh1')", "select english.eng_then_now_candidates(gen_random_uuid())"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "authenticated", U().studentNguyen, async (q) => q(sql)), "42501");
      await fail(as(db.client, "authenticated", U().tutorNguyen, async (q) => q(sql)), "42501");
    }
    for (const sql of ["select english.eng_attempt_text(gen_random_uuid())", "select english.eng_pickable_write(gen_random_uuid(), gen_random_uuid())"]) {
      await fail(as(db.client, "authenticated", U().studentNguyen, async (q) => q(sql)), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql)), "42501");
    }
  });

  describe("who may pick", () => {
    let a: string;
    let b: string;
    beforeAll(async () => {
      a = await attempt(writeNg, NG(), { daysAgo: 70, text: "My name is Nguyen. I like robots." });
      b = await attempt(writeNg, NG(), { daysAgo: 2, text: "In my opinion, robots can help us learn." });
    });
    it("only the child's own tutor: the parent, the other child's tutor, a student and an unknown member are refused with tutor_only", async () => {
      await fail(pick(M().parent, a, b), "42501", /\(tutor_only\)/);
      await fail(pick(M().tutorAn, a, b), "42501", /\(tutor_only\)/);
      await fail(pick(M().studentNguyen, a, b), "42501", /\(tutor_only\)/);
      await fail(pick(randomUUID(), a, b), "42501", /\(tutor_only\)/);
      // a tutor whose relation with the child ended
      const oldUser = (await q1<{ id: string }>("insert into auth.users(id, email) values (gen_random_uuid(), 'old-tutor-w4e@test.local') returning id"))[0]!.id;
      const oldTutor = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'tutor', 'Cô cũ') returning id", [oldUser, s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation, valid_from, valid_to) values ($1, $2, 'tutor', now() - interval '60 days', now() - interval '1 day')", [oldTutor, NG()]);
      await fail(pick(oldTutor, a, b), "42501", /\(tutor_only\)/);
    });
    it("the tutor of the child may pick; the same client id is a replay, another pick under it is refused", async () => {
      const cid = randomUUID();
      const p = await pick(M().tutorNguyen, a, b, { clientId: cid, note: "  Hai tháng đấy!  " });
      expect(p.replayed).toBe(false);
      expect(await pick(M().tutorNguyen, a, b, { clientId: cid, note: "Hai tháng đấy!" })).toEqual({ id: p.id, replayed: true });
      await fail(pick(M().tutorNguyen, a, b, { clientId: cid, note: "Khác" }), "23505", /client_id_reused/);
      await fail(pick(M().tutorNguyen, b, a, { clientId: cid }), "23505", /client_id_reused/);
      await fail(pick(M().tutorNguyen, a, b, { clientId: "short" }), "22023", /bad_client_id/);
      const audit = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'then_now.picked' and learner_id = $1 order by at desc limit 1", [NG()]);
      expect(Object.keys(audit[0]!.payload).sort()).toEqual(["pick", "status"]); // no text
    });
  });

  describe("what may be picked", () => {
    let early: string;
    let late: string;
    beforeAll(async () => {
      early = await attempt(writeNg, NG(), { daysAgo: 80, text: "Early piece." });
      late = await attempt(writeNg, NG(), { daysAgo: 1, text: "Late piece." });
    });
    const bad = (t: string, n: string) => fail(pick(M().tutorNguyen, t, n), "22023", /\(bad_pick\)/);
    it("two pieces of the child's own writing, the first on an earlier day", async () => {
      await pick(M().tutorNguyen, early, late);
      await bad(late, early); // the wrong way round
      await bad(early, early); // the same piece twice
      const sameDay = await attempt(writeNg, NG(), { daysAgo: 1, text: "Same day as late." });
      await bad(late, sameDay);
      await bad(sameDay, late);
      await bad(randomUUID(), late); // unknown
    });
    it("another child's piece is refused (bad_pick), even for the tutor of both... of neither", async () => {
      const anPiece = await attempt(writeAn, AN(), { daysAgo: 30, text: "My name is An.", member: M().studentAn });
      await bad(anPiece, late);
      await bad(early, anPiece);
      await fail(pick(M().tutorAn, early, late, { learner: AN() }), "22023", /\(bad_pick\)/); // the right tutor, but pieces of Nguyên
    });
    it("only writing steps: not an answers-only step, not a revision, not a session record, not an imported work, not an empty text", async () => {
      const notWriting = await attempt(otherStepNg, NG(), { daysAgo: 40, text: "Said something." });
      await bad(notWriting, late);
      const live = await attempt(writeNg, NG(), { daysAgo: 41, provenance: "tutor_live", text: "Written in a session." });
      await bad(live, late);
      const imported = await attempt(writeNg, NG(), { daysAgo: 42, provenance: "imported", text: "Imported." });
      await bad(imported, late);
      const noText = await attempt(writeNg, NG(), { daysAgo: 43, text: null });
      await bad(noText, late);
      const blank = await attempt(writeNg, NG(), { daysAgo: 44, text: "   " });
      await bad(blank, late);
      const answersOnly = await attempt(writeNg, NG(), { daysAgo: 45, kind: "answers" });
      await bad(answersOnly, late);
      // a paper essay typed in by an adult (manual_import) and a pasted text are allowed (Q16)
      const typed = await attempt(writeNg, NG(), { daysAgo: 79, provenance: "manual_import", text: "Typed from the paper.", member: M().tutorNguyen });
      const pasted = await attempt(writeNg, NG(), { daysAgo: 46, provenance: "pasted", text: "Pasted." });
      await pick(M().tutorNguyen, typed, late);
      await pick(M().tutorNguyen, pasted, late);
    });
    it("a revision step (mode REVISION) is not picked", async () => {
      const revisionStep = (await q1<{ id: string }>(
        `insert into english.activity_instances(inquiry_instance_id, learner_id, step_no, activity_type, mode, purpose, target_ids, scheduled_for)
         select inquiry_instance_id, learner_id, 99, 'ACT-WRITE', 'REVISION', '{}', target_ids, scheduled_for from english.activity_instances where id = $1 returning id`, [writeNg]))[0]!.id;
      const rev = await attempt(revisionStep, NG(), { daysAgo: 50, text: "A revised text." });
      await bad(rev, late);
    });
    it("the note: at most 200 characters, never score-like, empty is none", async () => {
      await fail(pick(M().tutorNguyen, early, late, { note: "a".repeat(201) }), "22023", /too_long/);
      await fail(pick(M().tutorNguyen, early, late, { note: "Bạn đã được 8/10 rồi" }), "22023", /score_words/);
      await fail(pick(M().tutorNguyen, early, late, { note: "8 điểm" }), "22023", /score_words/);
      await fail(pick(M().tutorNguyen, early, late, { note: "Đạt yêu cầu" }), "22023", /score_words/);
      await fail(pick(M().tutorNguyen, early, late, { note: "Tăng 40%" }), "22023", /score_words/);
      await pick(M().tutorNguyen, early, late, { note: "a".repeat(200) });
      await pick(M().tutorNguyen, early, late, { note: "   " });
      expect((await q1<{ note: string | null }>("select note from english.then_now_picks where learner_id = $1 order by created_at desc, id desc limit 1", [NG()]))[0]!.note).toBeNull();
      await fail(pick(M().tutorNguyen, early, late, { status: "gone" }), "22023", /bad_status/);
    });
    it("the table itself also refuses a score-like note and a pair of the same piece", async () => {
      const row = (note: string | null, t: string, n: string) =>
        db.client.query("insert into english.then_now_picks(learner_id, then_attempt_id, now_attempt_id, note, status, by_member, by_role, client_id) values ($1,$2,$3,$4,'shown',$5,'tutor',$6)", [NG(), t, n, note, M().tutorNguyen, randomUUID()]);
      await fail(row("8/10", early, late), "23514");
      await fail(row("ok", early, early), "23514");
    });
  });

  describe("what the child reads", () => {
    it("nothing until a pick; the child sees the NEWEST pick; 'hidden' hides the card; keys are only then / now / note", async () => {
      const a1 = await attempt(writeAn, AN(), { daysAgo: 90, text: "My name is An. I like cat.", member: M().studentAn });
      const a2 = await attempt(writeAn, AN(), { daysAgo: 5, text: "Last week we grew a bean plant.", member: M().studentAn });
      const a3 = await attempt(writeAn, AN(), { daysAgo: 20, text: "The seed needs water.", member: M().studentAn });
      expect(await mine(U().studentAn)).toBeNull();
      await pick(M().tutorAn, a1, a2, { learner: AN(), note: "Câu dài hơn nhiều." });
      const first = (await mine(U().studentAn))!;
      expect(first.then.text).toBe("My name is An. I like cat.");
      expect(first.now.text).toBe("Last week we grew a bean plant.");
      expect(first.note).toBe("Câu dài hơn nhiều.");
      expect(first.then.on < first.now.on).toBe(true);
      expect(Object.keys(first).sort()).toEqual(["note", "now", "then"]);
      expect(keysOf(first).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
      await pick(M().tutorAn, a3, a2, { learner: AN(), note: null });
      expect((await mine(U().studentAn))!.then.text).toBe("The seed needs water."); // the newest pick wins
      expect((await mine(U().studentAn))!.note).toBeNull();
      await pick(M().tutorAn, a3, a2, { learner: AN(), status: "hidden" });
      expect(await mine(U().studentAn)).toBeNull();
      await pick(M().tutorAn, a1, a3, { learner: AN() });
      expect((await mine(U().studentAn))!.then.text).toBe("My name is An. I like cat.");
    });
    it("one child never reads the other's pair; an adult reads nothing from this function", async () => {
      const ng = (await mine(U().studentNguyen))!;
      const an = (await mine(U().studentAn))!;
      expect(ng.then.text).not.toBe(an.then.text);
      expect(JSON.stringify(ng)).not.toContain("An. I like cat");
      expect(await mine(U().parent)).toBeNull();
      expect(await mine(U().tutorNguyen)).toBeNull();
    });
  });

  it("the adult list: the pieces that may be picked (not session records, imports or other children's), newest first, plus the current pick", async () => {
    const list = await candidates(NG());
    expect(list.candidates.length).toBeGreaterThan(2);
    expect(list.candidates.map((c) => c.at)).toEqual([...list.candidates.map((c) => c.at)].sort().reverse());
    const ids = new Set(list.candidates.map((c) => c.id));
    const bad = await q1<{ id: string }>("select t.id from english.attempts t where t.learner_id = $1 and t.provenance in ('tutor_live', 'imported')", [NG()]);
    for (const b of bad) expect(ids.has(b.id)).toBe(false);
    const anIds = new Set((await q1<{ id: string }>("select id from english.attempts where learner_id = $1", [AN()])).map((r) => r.id));
    for (const c of list.candidates) expect(anIds.has(c.id)).toBe(false);
    expect(list.current).toMatchObject({ status: "shown" });
    expect((await candidates(AN())).candidates.length).toBeGreaterThan(0);
    await fail(svc("select english.eng_then_now_candidates($1) as r", [randomUUID()]), "P0002");
  });

  it("purge: the preview counts the picks, the receipt deletes them (before the attempts they point at) and nothing of the other child", async () => {
    const before = (await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks where learner_id = $1", [NG()]))[0]!.n;
    const otherBefore = (await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks where learner_id = $1", [AN()]))[0]!.n;
    expect(before).toBeGreaterThan(0);
    expect(otherBefore).toBeGreaterThan(0);
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [NG()]);
    expect(dry.counts.then_now_picks).toBe(before);
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [NG(), U().parent]);
    expect(receipt.deleted.then_now_picks).toBe(before);
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect((await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks where learner_id = $1", [NG()]))[0]!.n).toBe(0);
    expect((await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks where learner_id = $1", [AN()]))[0]!.n).toBe(otherBefore);
  });

  it("applying the migration twice changes nothing", async () => {
    const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_then_now.sql"))!;
    const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const before = (await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks"))[0]!.n;
    await db.client.query(sql);
    await db.client.query(sql);
    expect((await q1<{ n: number }>("select count(*)::int as n from english.then_now_picks"))[0]!.n).toBe(before);
    expect((await q1<{ n: number }>("select count(*)::int as n from english.schema_migrations where version = $1", [file.slice(0, 4)]))[0]!.n).toBe(1);
  });
});
