import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

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
      await q1(`insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','Đảo ngữ',$2,'tutor','c-seed-0001')`, [NG(), M().tutorNguyen]);
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
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted.teaching_notes).toBe(1); expect(receipt.deleted.learner_intake).toBe(1);
      expect(await q1("select 1 from english.teaching_notes where learner_id=$1", [L])).toEqual([]);
    });
  });
});
