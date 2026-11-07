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
});
