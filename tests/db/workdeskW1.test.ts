import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createAuthUser, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("W1 workdesk (migration 0025)", () => {
  let db: TestDb; let s: Seeded;
  const M = () => s.members; const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull(); expect(err?.code, err?.message).toBe(code); if (re) expect(err?.message).toMatch(re);
  };
  beforeAll(async () => { db = await createTestDb(); await migrate(db.client); s = await seed(db.client); });
  afterAll(async () => { await db?.drop(); });

  describe("1. tables", () => {
    it("exist, are append-only and reject direct inserts from service_role", async () => {
      for (const t of ["teaching_notes", "learner_intake", "app_feedback", "app_feedback_events"]) {
        expect((await q1("select to_regclass($1) as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc("insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','x',$2,'tutor','c-00000001')", [NG(), M().tutorNguyen]), "42501");
    });
    it("students read nothing; tutor of the child and parent of the family read", async () => {
      await svc("select english.eng_write_teaching_note($1,'focus','Đảo ngữ',$2,'c-seed-0001') as r", [NG(), M().tutorNguyen]);
      const read = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select count(*)::int as n from english.teaching_notes where learner_id = $1", [NG()])).rows[0] as { n: number });
      expect((await read(s.users.studentNguyen)).n).toBe(0);
      expect((await read(s.users.tutorNguyen)).n).toBe(1);
      expect((await read(s.users.parent)).n).toBe(1);
      expect((await read(s.users.tutorAn)).n).toBe(0);
    });
  });

  describe("2. writing notes and intake", () => {
    const note = (by: string, o: { learner?: string; field?: string; text?: string; clientId?: string } = {}) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_write_teaching_note($1,$2,$3,$4,$5) as r",
        [o.learner ?? NG(), o.field ?? "focus", o.text ?? "Đảo ngữ, câu điều kiện hỗn hợp", by, o.clientId ?? randomUUID()]);
    const intake = (by: string, content: unknown, clientId = randomUUID()) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_write_intake($1,$2::jsonb,$3,$4) as r", [NG(), JSON.stringify(content), by, clientId]);
    it("the child's tutor writes a note field; replay returns the same id; the latest row per field is current", async () => {
      const a = await note(M().tutorNguyen, { clientId: "tn-00000001" });
      expect(a.replayed).toBe(false);
      expect(await note(M().tutorNguyen, { clientId: "tn-00000001" })).toEqual({ id: a.id, replayed: true });
      await note(M().tutorNguyen, { text: "Đảo ngữ thôi" });
      const rows = await q1<{ text: string }>("select text from english.teaching_notes where learner_id=$1 and field='focus' order by created_at desc limit 1", [NG()]);
      expect(rows[0]?.text).toBe("Đảo ngữ thôi");
    });
    it("parent and a tutor of another child cannot write; bad field / too long rejected", async () => {
      await fail(note(M().parent), "42501", /\(tutor_only\)/);
      await fail(note(M().tutorAn), "42501", /\(tutor_only\)/);
      await fail(note(M().tutorNguyen, { field: "mood" }), "22023", /\(bad_field\)/);
      await fail(note(M().tutorNguyen, { text: "x".repeat(601) }), "22023", /\(too_long\)/);
    });
    it("intake: goals + strengths/weaknesses by domain; unknown domain rejected; parent rejected", async () => {
      const ok = { goals: [{ title: "Thi vào 10", due: "2027-06" }], strengths: { vocab: "Từ vựng khá" }, weaknesses: { listening: "Nghe yếu" }, note: "" };
      expect((await intake(M().tutorNguyen, ok)).replayed).toBe(false);
      await fail(intake(M().tutorNguyen, { ...ok, strengths: { music: "x" } }), "22023", /\(bad_content\)/);
      await fail(intake(M().tutorNguyen, { goals: "no" }), "22023", /\(bad_content\)/);
      await fail(intake(M().parent, ok), "42501", /\(tutor_only\)/);
    });
  });

  describe("3. app feedback", () => {
    const send = (by: string, o: { kind?: string; screen?: string; text?: string; clientId?: string } = {}) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_send_app_feedback($1,$2,$3,$4,$5) as r",
        [o.kind ?? "hard_to_use", o.screen ?? "Ghi buổi học", o.text ?? "Chọn kỹ năng phải cuộn lâu", by, o.clientId ?? randomUUID()]);
    const upd = (by: string, id: string, status: string, reply: string | null = null, clientId = randomUUID()) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_update_app_feedback($1,$2,$3,$4,$5) as r", [id, status, reply, by, clientId]);
    it("tutor or parent sends; a 'new' event is created; a student cannot", async () => {
      const r = await send(M().tutorNguyen);
      expect((await q1<{ status: string }>("select status from english.app_feedback_events where feedback_id=$1", [r.id]))[0]?.status).toBe("new");
      expect((await send(M().parent)).replayed).toBe(false);
      await fail(send(M().studentNguyen), "42501", /\(staff_only\)/);
      await fail(send(M().tutorNguyen, { kind: "praise" }), "22023", /\(bad_kind\)/);
    });
    it("only the parent changes status / replies; the latest event is current; unknown id rejected", async () => {
      const r = await send(M().tutorAn);
      await fail(upd(M().tutorAn, r.id, "done"), "42501", /\(parent_only\)/);
      await upd(M().parent, r.id, "in_progress", "Mẹ: bản sau sẽ sửa");
      await upd(M().parent, r.id, "done");
      const ev = await q1<{ status: string; reply: string | null }>("select status, reply from english.app_feedback_events where feedback_id=$1 order by created_at desc", [r.id]);
      expect(ev.map((e) => e.status)).toEqual(["done", "in_progress", "new"]);
      await fail(upd(M().parent, r.id, "fixed"), "22023", /\(bad_status\)/);
      await fail(upd(M().parent, randomUUID(), "done"), "P0002");
    });
  });

  describe("4. purge", () => {
    it("dry run counts teaching_notes and learner_intake; purge removes them; app_feedback untouched", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa W1','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await svc("select english.eng_write_teaching_note($1,'focus','x',$2,'pg-00000001') as r", [L, M().tutorNguyen]);
      await svc("select english.eng_write_intake($1,'{\"goals\":[]}'::jsonb,$2,'pg-00000002') as r", [L, M().tutorNguyen]);
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts.teaching_notes).toBe(1); expect(dry.counts.learner_intake).toBe(1);
      const fbBefore = await q1<{ n: string; e: string }>("select (select count(*) from english.app_feedback) as n, (select count(*) from english.app_feedback_events) as e");
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted.teaching_notes).toBe(1); expect(receipt.deleted.learner_intake).toBe(1);
      expect(await q1("select 1 from english.teaching_notes where learner_id=$1", [L])).toEqual([]);
      const fbAfter = await q1<{ n: string; e: string }>("select (select count(*) from english.app_feedback) as n, (select count(*) from english.app_feedback_events) as e");
      expect(fbAfter).toEqual(fbBefore);
      expect(Number(fbBefore[0]!.n)).toBeGreaterThan(0);
    });
  });

  describe("5. replay safety, limits, audit", () => {
    const send = (by: string, o: { kind?: string; text?: string; clientId?: string } = {}) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_send_app_feedback($1,'Ghi buổi học',$2,$3,$4) as r", [o.kind ?? "bug", o.text ?? "Nút không bấm được", by, o.clientId ?? randomUUID()]);
    const upd = (by: string, id: string, status: string, reply: string | null, clientId: string = randomUUID()) =>
      svc<{ id: string; replayed: boolean }>("select english.eng_update_app_feedback($1,$2,$3,$4,$5) as r", [id, status, reply, by, clientId]);
    it("L1: the same client id with different content is refused (23505 client_id_reused) in all four functions", async () => {
      await svc("select english.eng_write_teaching_note($1,'avoid','A',$2,'reuse-0001') as r", [NG(), M().tutorNguyen]);
      await fail(svc("select english.eng_write_teaching_note($1,'avoid','B',$2,'reuse-0001') as r", [NG(), M().tutorNguyen]), "23505", /\(client_id_reused\)/);
      await svc("select english.eng_write_intake($1,'{\"goals\":[]}'::jsonb,$2,'reuse-0002') as r", [NG(), M().tutorNguyen]);
      await fail(svc("select english.eng_write_intake($1,'{\"goals\":[],\"note\":\"x\"}'::jsonb,$2,'reuse-0002') as r", [NG(), M().tutorNguyen]), "23505", /\(client_id_reused\)/);
      const f = await send(M().parent, { clientId: "reuse-0003" });
      expect((await send(M().parent, { clientId: "reuse-0003" })).replayed).toBe(true);
      await fail(send(M().parent, { clientId: "reuse-0003", text: "Khác" }), "23505", /\(client_id_reused\)/);
      await upd(M().parent, f.id, "in_progress", "ok", "reuse-0004");
      expect((await upd(M().parent, f.id, "in_progress", "ok", "reuse-0004")).replayed).toBe(true);
      await fail(upd(M().parent, f.id, "done", "ok", "reuse-0004"), "23505", /\(client_id_reused\)/);
    });
    it("L2: a 90-character client id works (the 'new' event id is derived separately); 91 is refused", async () => {
      const id = "x".repeat(90);
      const r = await send(M().parent, { clientId: id });
      expect((await send(M().parent, { clientId: id })).replayed).toBe(true);
      expect((await q1("select 1 from english.app_feedback_events where feedback_id=$1 and status='new'", [r.id])).length).toBe(1);
      await fail(send(M().parent, { clientId: "y".repeat(91) }), "22023", /\(bad_client_id\)/);
    });
    it("L4: 'wont_do' needs a non-empty reply (23514 reply_required)", async () => {
      const f = await send(M().parent);
      await fail(upd(M().parent, f.id, "wont_do", null), "23514", /\(reply_required\)/);
      await fail(upd(M().parent, f.id, "wont_do", "   "), "23514", /\(reply_required\)/);
      expect((await upd(M().parent, f.id, "wont_do", "Chưa làm kỳ này")).replayed).toBe(false);
    });
    it("L10: sending / updating leaves audit rows without text", async () => {
      const f = await send(M().tutorNguyen, { text: "RIÊNG-TƯ-12345" });
      await upd(M().parent, f.id, "done", "RIÊNG-TƯ-67890");
      const rows = await q1<{ action: string; payload: unknown }>("select action, payload from english.audit_log where action like 'app_feedback.%' order by id desc limit 2");
      expect(rows.map((r) => r.action).sort()).toEqual(["app_feedback.sent", "app_feedback.updated"]);
      expect(JSON.stringify(rows)).not.toContain("RIÊNG-TƯ");
    });
    it("M3: an intake of about 11000 characters is accepted (cap 12000)", async () => {
      const big = { goals: [], strengths: { vocab: "a".repeat(10000) } };
      expect((await svc<{ replayed: boolean }>("select english.eng_write_intake($1,$2::jsonb,$3,$4) as r", [NG(), JSON.stringify(big), M().tutorNguyen, randomUUID()])).replayed).toBe(false);
      const huge = { goals: [], strengths: { vocab: "a".repeat(12100) } };
      await fail(svc("select english.eng_write_intake($1,$2::jsonb,$3,$4) as r", [NG(), JSON.stringify(huge), M().tutorNguyen, randomUUID()]), "22023", /\(bad_content\)/);
    });
  });

  describe("6. who sees app feedback (tutor: own items only; parent: all; ended tutor and other families: none)", () => {
    const send = (by: string, text: string) => svc<{ id: string }>("select english.eng_send_app_feedback('suggestion','Hộp duyệt',$1,$2,$3) as r", [text, by, randomUUID()]);
    const seen = (uid: string, table = "app_feedback") => asCommit(db.client, "authenticated", uid, async (q) => (await q(`select id from english.${table}`)).rows.map((r) => (r as { id: string }).id));
    const evSeen = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select feedback_id from english.app_feedback_events")).rows.map((r) => (r as { feedback_id: string }).feedback_id));
    let endedUser = ""; let endedMember = ""; let otherParentUser = "";
    beforeAll(async () => {
      endedUser = await createAuthUser(db.client, "ended-tutor@test.local");
      endedMember = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1,$2,'tutor','Gia sư cũ') returning id", [endedUser, s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation, valid_from, valid_to) values ($1,$2,'tutor','2026-01-01','2026-02-01')", [endedMember, NG()]);
      otherParentUser = await createAuthUser(db.client, "other-parent@test.local");
      const fam = (await q1<{ id: string }>("insert into english.families(name) values ('Gia đình khác') returning id"))[0]!.id;
      await q1("insert into english.members(user_id, family_id, role, display_name) values ($1,$2,'parent','Phụ huynh khác')", [otherParentUser, fam]);
    });
    it("tutorAn cannot see tutorNguyen's item; the parent sees both; students and other families see none", async () => {
      const a = await send(M().tutorAn, "Của gia sư An");
      const n = await send(M().tutorNguyen, "Của gia sư Nguyên");
      const mine = await seen(s.users.tutorAn);
      expect(mine).toContain(a.id); expect(mine).not.toContain(n.id);
      const theirs = await seen(s.users.tutorNguyen);
      expect(theirs).toContain(n.id); expect(theirs).not.toContain(a.id);
      const all = await seen(s.users.parent);
      expect(all).toContain(a.id); expect(all).toContain(n.id);
      expect((await evSeen(s.users.tutorAn))).not.toContain(n.id);
      expect((await evSeen(s.users.parent))).toEqual(expect.arrayContaining([a.id, n.id]));
      for (const uid of [s.users.studentAn, s.users.studentNguyen, otherParentUser]) {
        expect(await seen(uid)).toEqual([]);
        expect(await evSeen(uid)).toEqual([]);
      }
    });
    it("an ended tutor can neither send nor read (staff_only), nor write notes", async () => {
      await fail(send(endedMember, "x"), "42501", /\(staff_only\)/);
      expect(await seen(endedUser)).toEqual([]);
      await fail(svc("select english.eng_write_teaching_note($1,'focus','x',$2,'ended-0001') as r", [NG(), endedMember]), "42501", /\(tutor_only\)/);
    });
    it("a tutor who sent feedback loses sight of it once the relationship ends", async () => {
      const f = await send(M().tutorAn, "Trước khi hết hạn");
      expect(await seen(s.users.tutorAn)).toContain(f.id);
      await q1("update english.relationships set valid_from='2026-01-01', valid_to='2026-02-01' where member_id=$1", [M().tutorAn]);
      expect(await seen(s.users.tutorAn)).toEqual([]);
      await q1("update english.relationships set valid_from='2026-01-01', valid_to=null where member_id=$1", [M().tutorAn]);
    });
  });
});
