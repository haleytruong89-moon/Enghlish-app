import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** UX round 3B · absences, session marks, lesson note v4 (migration 0030). One database. */
describe("session_absences + session_marks + eng_write_lesson_note_v4 (migration 0030)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const day = async (delta: number) => (await q1<{ d: string }>("select (english.eng_today_vn() + $1::int)::text as d", [delta]))[0]!.d;
  type R = { id: string; replayed?: boolean; kind?: string };
  const absence = async (o: { on?: number; by?: string; party?: string; billable?: boolean; note?: string | null; learner?: string; clientId?: string } = {}) =>
    svc<R>("select english.eng_record_absence($1,$2::date,$3,$4,$5,$6,$7) as r", [
      o.learner ?? NG(), await day(o.on ?? -3), o.party ?? "student", o.billable ?? false, o.note ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  const note = (o: { by?: string; learner?: string; supersedes?: string | null; clientId?: string; date?: number } = {}) =>
    day(o.date ?? 0).then((d) => svc<R>("select english.eng_write_lesson_note_v2($1, $2::date, 'Ôn bài', '{}', null, null, '[]'::jsonb, $3, $4, $5) as r", [
      o.learner ?? NG(), d, o.supersedes ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]));
  const mark = (noteId: string, kind: string, o: { makeupFor?: string | null; reason?: string | null; by?: string; clientId?: string } = {}) =>
    svc<R>("select english.eng_mark_session($1,$2,$3,$4,$5,$6) as r", [noteId, kind, o.makeupFor ?? null, o.reason ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID()]);
  const v4 = (o: { kind?: string; makeupFor?: string | null; supersedes?: string | null; clientId?: string; by?: string; date?: number } = {}) =>
    day(o.date ?? -1).then((d) => svc<R>("select english.eng_write_lesson_note_v4($1,$2::date,'Học bù','{}',null,null,'[]'::jsonb,$3,$4,$5,'{}','[]'::jsonb,$6,$7) as r", [
      NG(), d, o.supersedes ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(), o.kind ?? "regular", o.makeupFor ?? null,
    ]));
  const count = async (t: string, where = "true", params: unknown[] = []) => (await q1<{ n: number }>(`select count(*)::int as n from english.${t} where ${where}`, params))[0]!.n;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("tables exist, refuse direct writes even from service_role, and are append-only", async () => {
    await fail(svc("insert into english.session_absences(learner_id, absent_on, requested_by, billable, by_member, by_role, client_id) values ($1, current_date, 'student', false, $2, 'tutor', 'abcdefgh1') returning 1 as r", [NG(), M().tutorNguyen]), "42501");
    const a = await absence();
    await fail(q1("update english.session_absences set billable = true where id = $1", [a.id]), "42501");
    await fail(q1("delete from english.session_absences where id = $1", [a.id]), "42501");
    await fail(svc("truncate english.session_absences"), "42501");
    const n = await note();
    const m = await mark(n.id, "regular");
    await fail(q1("update english.session_marks set kind = 'makeup' where id = $1", [m.id]), "42501");
    await fail(q1("delete from english.session_marks where id = $1", [m.id]), "42501");
    await fail(svc("truncate english.session_marks"), "42501");
  });

  it("the child's tutor and the parent read; the other tutor and students read nothing", async () => {
    const a = await absence();
    const cnt = async (uid: string) => (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.session_absences where id = $1", [a.id]))[0]!.n;
    expect(await cnt(s.users.tutorNguyen)).toBe(1);
    expect(await cnt(s.users.parent)).toBe(1);
    expect(await cnt(s.users.tutorAn)).toBe(0);
    expect(await cnt(s.users.studentNguyen)).toBe(0);
    const n = await note();
    const m = await mark(n.id, "regular");
    const cm = async (uid: string) => (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.session_marks where id = $1", [m.id]))[0]!.n;
    expect([await cm(s.users.tutorNguyen), await cm(s.users.parent), await cm(s.users.tutorAn), await cm(s.users.studentNguyen)]).toEqual([1, 1, 0, 0]);
  });

  it("eng_record_absence: valid row + audit without the note text; window; party; actors; replay", async () => {
    const a = await absence({ note: "Con ốm, báo trước", billable: true, party: "other" });
    expect(a.replayed).toBe(false);
    const audit = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'session_absence.recorded' and payload->>'absence' = $1", [a.id]);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.payload)).not.toContain("ốm");
    await fail(absence({ on: -121 }), "23514", /bad_date/);
    await fail(absence({ on: 61 }), "23514", /bad_date/);
    await absence({ on: -120 });
    await absence({ on: 60 });
    await fail(absence({ party: "teacher" }), "22023", /bad_party/);
    await fail(absence({ by: M().tutorAn }), "42501");
    await fail(absence({ by: M().studentNguyen }), "42501");
    // permissions come before every other check
    await fail(absence({ by: M().tutorAn, on: -999, party: "x" }), "42501");
    const cid = randomUUID();
    const first = await absence({ clientId: cid, note: "x y", on: -2 });
    expect((await absence({ clientId: cid, note: "x y", on: -2 })).replayed).toBe(true);
    expect((await absence({ clientId: cid, note: "x y", on: -2 })).id).toBe(first.id);
    await fail(absence({ clientId: cid, note: "khác", on: -2 }), "23505");
    await fail(absence({ clientId: "short" }), "22023");
    // the parent may record too
    expect((await absence({ by: M().parent })).replayed).toBe(false);
  });

  it("eng_cancel_absence: reason, once, never a cancel row", async () => {
    const a = await absence();
    await fail(svc("select english.eng_cancel_absence($1,'  ',$2,$3) as r", [a.id, M().tutorNguyen, randomUUID()]), "23514", /reason_required/);
    await fail(svc("select english.eng_cancel_absence($1,'ghi nhầm ngày',$2,$3) as r", [a.id, M().tutorAn, randomUUID()]), "42501");
    const cid = randomUUID();
    const c = await svc<R>("select english.eng_cancel_absence($1,'ghi nhầm ngày',$2,$3) as r", [a.id, M().tutorNguyen, cid]);
    expect(c.replayed).toBe(false);
    expect((await svc<R>("select english.eng_cancel_absence($1,'ghi nhầm ngày',$2,$3) as r", [a.id, M().tutorNguyen, cid])).replayed).toBe(true);
    await fail(svc("select english.eng_cancel_absence($1,'ghi nhầm lần hai',$2,$3) as r", [a.id, M().parent, randomUUID()]), "23505", /already_cancelled/);
    await fail(svc("select english.eng_cancel_absence($1,'bỏ dòng bỏ',$2,$3) as r", [c.id, M().tutorNguyen, randomUUID()]), "22023");
    expect(await q1("select billable, cancels_id = $2 as c from english.session_absences where id = $1", [c.id, a.id])).toEqual([{ billable: false, c: true }]);
  });

  it("eng_mark_session: not_current, reasons, makeup_for rules, replay", async () => {
    const n1 = await note({ date: -10 });
    const n2 = await note({ date: -10, supersedes: n1.id });
    await fail(mark(n1.id, "regular"), "23514", /not_current/);
    await fail(mark(n2.id, "not_counted"), "23514", /reason_required/);
    await fail(mark(n2.id, "not_counted", { reason: "abc" }), "23514", /reason_required/);
    await fail(mark(n2.id, "weird"), "22023", /bad_kind/);
    await fail(mark(n2.id, "regular", { by: M().tutorAn }), "42501");
    await fail(mark(n2.id, "regular", { makeupFor: randomUUID() }), "23514", /bad_absence/);
    const a = await absence();
    await fail(mark(n2.id, "regular", { makeupFor: a.id }), "23514", /bad_absence/);
    await fail(mark(n2.id, "makeup", { makeupFor: randomUUID() }), "23514", /bad_absence/);
    const other = await absence({ learner: s.learners.an, by: M().tutorAn });
    await fail(mark(n2.id, "makeup", { makeupFor: other.id }), "23514", /bad_absence/);
    const cancelled = await absence();
    await svc("select english.eng_cancel_absence($1,'ghi nhầm',$2,$3) as r", [cancelled.id, M().tutorNguyen, randomUUID()]);
    await fail(mark(n2.id, "makeup", { makeupFor: cancelled.id }), "23514", /bad_absence/);
    const cid = randomUUID();
    const ok = await mark(n2.id, "makeup", { makeupFor: a.id, clientId: cid });
    expect(ok.replayed).toBe(false);
    expect((await mark(n2.id, "makeup", { makeupFor: a.id, clientId: cid })).replayed).toBe(true);
    await fail(mark(n2.id, "regular", { clientId: cid }), "23505");
    expect((await mark(n2.id, "not_counted", { reason: "ghi nhầm em", by: M().parent })).replayed).toBe(false);
    await fail(mark(randomUUID(), "regular"), "P0002");
  });

  it("v4: a makeup note writes the note and the mark together; a bad absence rolls the whole note back", async () => {
    const a = await absence();
    const cid = randomUUID();
    const r = await v4({ kind: "makeup", makeupFor: a.id, clientId: cid });
    expect(r.kind).toBe("makeup");
    expect(await q1("select kind, makeup_for = $2 as f, client_id from english.session_marks where lesson_note_id = $1", [r.id, a.id])).toEqual([{ kind: "makeup", f: true, client_id: `${cid}:kind` }]);
    const before = await count("lesson_notes", "learner_id = $1", [NG()]);
    const bad = randomUUID();
    await fail(v4({ kind: "makeup", makeupFor: randomUUID(), clientId: bad }), "23514", /bad_absence/);
    expect(await count("lesson_notes", "learner_id = $1", [NG()])).toBe(before);
    expect(await count("lesson_notes", "client_id = $1", [bad])).toBe(0);
  });

  it("v4: regular adds no mark; supersedes + makeup refused; replay; other kind with the same client_id", async () => {
    const cid = randomUUID();
    const r = await v4({ clientId: cid });
    expect(await count("session_marks", "lesson_note_id = $1", [r.id])).toBe(0);
    const again = await v4({ clientId: cid });
    expect(again.replayed).toBe(true);
    expect(await count("lesson_notes", "client_id = $1", [cid])).toBe(1);
    await fail(v4({ clientId: cid, kind: "makeup" }), "23505");
    await fail(v4({ kind: "makeup", supersedes: r.id }), "22023", /kind_on_edit/);
    await fail(v4({ kind: "not_counted" }), "22023", /bad_kind/);
    await fail(v4({ makeupFor: randomUUID() }), "22023", /bad_absence/);
    await fail(v4({ by: M().tutorAn }), "42501");
    // an edit of a regular note still works through v4
    const edit = await v4({ supersedes: r.id });
    expect(edit.replayed).toBe(false);
    // makeup replay
    const mcid = randomUUID();
    const mk = await v4({ kind: "makeup", clientId: mcid });
    expect((await v4({ kind: "makeup", clientId: mcid })).id).toBe(mk.id);
    const a = await absence();
    await fail(v4({ kind: "makeup", makeupFor: a.id, clientId: mcid }), "23505");
    // v2 and v3 called directly still work
    expect((await note()).replayed).toBe(false);
  });

  it("purge: the dry run and the receipt count both tables; afterwards there are no rows", async () => {
    const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa 3B','B',true,'active') returning id", [s.familyId]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
    const a = await absence({ learner: L });
    const c = await svc<R>("select english.eng_cancel_absence($1,'ghi nhầm',$2,$3) as r", [a.id, M().tutorNguyen, randomUUID()]);
    expect(c.replayed).toBe(false);
    const a2 = await absence({ learner: L });
    const n = await note({ learner: L });
    await mark(n.id, "makeup", { makeupFor: a2.id });
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
    expect(dry.counts).toMatchObject({ session_absences: 3, session_marks: 1, lesson_notes: 1 });
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
    expect(receipt.deleted).toMatchObject({ session_absences: 3, session_marks: 1, lesson_notes: 1 });
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect(await count("session_absences", "learner_id = $1", [L])).toBe(0);
    expect(await count("session_marks", "learner_id = $1", [L])).toBe(0);
  });

  it("the migration can run again without error", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(new URL("../../db/migrations/0030_session_billing.sql", import.meta.url), "utf8");
    await db.client.query(sql);
    await db.client.query(sql);
  });
});
