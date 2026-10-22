import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** SM-2 (migration 0020): level decisions, external results, the profile and the student's review list. One database for the file. */
describe("SM-2 level profile (migration 0020)", () => {
  let db: TestDb;
  let s: Seeded;
  let oldTutor: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const TODAY = todayVn();
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  /** A throwaway child in the test family, with Nguyên's tutor as its tutor (the parent is in scope through the family). */
  const newLearner = async (track: "A" | "B") => {
    const id = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, $2, $3, true, 'active') returning id",
      [s.familyId, `Em thử ${randomUUID().slice(0, 6)}`, track]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [M().tutorNguyen, id]);
    return id;
  };
  type Rec = { ids: string[]; replayed: boolean };
  const rec = (by: string, o: { learner?: string; kind?: string; levels?: unknown; reason?: string | null; clientId?: string } = {}) =>
    svc<Rec>("select english.eng_record_level($1, $2, $3::jsonb, $4, $5, $6) as r", [
      o.learner ?? NG(), o.kind ?? "baseline", JSON.stringify(o.levels ?? { grammar: "B2" }), o.reason ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const ext = (by: string, o: { learner?: string; exam?: string; takenOn?: string; score?: string; domains?: string[]; note?: string | null; file?: unknown; clientId?: string } = {}) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_record_external_result($1, $2, $3::date, $4, $5::text[], $6, $7::jsonb, $8, $9) as r", [
      o.learner ?? NG(), o.exam ?? "FCE", o.takenOn ?? addDays(TODAY, -30), o.score ?? "172 · Grade B", o.domains ?? ["reading", "listening"],
      o.note ?? null, o.file === undefined ? null : JSON.stringify(o.file), by, o.clientId ?? randomUUID(),
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    // a tutor whose relationship with Nguyên has ended
    const oldUser = await createAuthUser(db.client, "old-tutor@test.local");
    oldTutor = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'tutor', 'Cô cũ') returning id", [oldUser, s.familyId]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation, valid_from, valid_to) values ($1, $2, 'tutor', now() - interval '60 days', now() - interval '1 day')", [oldTutor, NG()]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. the two books", () => {
    const insertDecision = (learner: string, over: Record<string, unknown> = {}) => {
      const v = { domain_key: "grammar", from_level: "B2", to_level: "B2", kind: "baseline", reason: null, decided_role: "tutor", client_id: randomUUID(), ...over };
      return q1(`insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, reason, decided_by_member, decided_role, client_id)
                 values ($1, $2, 'SM-1', $3, $4, $5, $6, $7, $8, $9)`,
        [learner, v.domain_key, v.from_level, v.to_level, v.kind, v.reason, M().tutorNguyen, v.decided_role, v.client_id]);
    };
    const insertExternal = (learner: string, over: Record<string, unknown> = {}) => {
      const v = { exam: "FCE", domains: ["reading"], recorded_role: "parent", file_id: null, ...over };
      return q1(`insert into english.external_results(learner_id, exam, taken_on, score_text, domains, file_id, recorded_by_member, recorded_role, client_id)
                 values ($1, $2, $3::date, '172', $4::text[], $5, $6, $7, $8)`,
        [learner, v.exam, TODAY, v.domains, v.file_id, M().parent, v.recorded_role, randomUUID()]);
    };

    it("are append-only (no update / delete / truncate outside a purge) and service_role cannot insert directly", async () => {
      const L = await newLearner("B");
      await insertDecision(L);
      await insertExternal(L);
      for (const sql of ["update english.level_decisions set reason = 'x'", "delete from english.level_decisions", "truncate english.level_decisions",
        "update english.external_results set note = 'x'", "delete from english.external_results", "truncate english.external_results"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      for (const sql of [
        "insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, decided_by_member, decided_role, client_id) values ($1, 'vocab', 'SM-1', 'B2', 'B2', 'baseline', $2, 'tutor', 'direct-insert-1')",
        "insert into english.external_results(learner_id, exam, taken_on, score_text, domains, recorded_by_member, recorded_role, client_id) values ($1, 'PET', current_date, '150', '{reading}', $2, 'tutor', 'direct-insert-2')",
      ]) {
        const err = await asCommit(db.client, "service_role", null, (q) => q(sql, [L, M().tutorNguyen])).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
    });

    it("table checks: level values, kinds, a reason for every adjustment, tutor-only decisions, exams and domains", async () => {
      const L = await newLearner("B");
      for (const over of [{ to_level: "D1" }, { from_level: "5" }, { kind: "promote" }, { kind: "adjust", reason: null }, { reason: "   " }, { decided_role: "parent" }]) {
        await fail(insertDecision(L, over), "23514");
      }
      await insertDecision(L, { kind: "adjust", reason: "Bài gần đây tốt", domain_key: "vocab" });
      for (const over of [{ exam: "IELTS" }, { domains: [] }, { domains: ["music"] }, { recorded_role: "student" }]) {
        await fail(insertExternal(L, over), "23514");
      }
    });

    it("files accept the new kind 'external_result' as a PDF or an image; the other kinds keep their rules", async () => {
      const L = await newLearner("B");
      const file = async (kind: string, mime: string, ext: string) => {
        const id = randomUUID();
        return q1(`insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, $4, $5, $6, 100, $7)`,
          [id, s.familyId, L, kind, `${s.familyId}/${L}/${id}.${ext}`, mime, M().parent]);
      };
      await file("external_result", "application/pdf", "pdf");
      await file("external_result", "image/jpeg", "jpg");
      await fail(file("result_image", "application/pdf", "pdf"), "23514");
      await fail(file("assignment_pdf", "image/png", "png"), "23514");
      await fail(file("scan", "image/png", "png"), "23514");
      expect(await n("select count(*)::int as n from pg_constraint where conrelid = 'english.files'::regclass and conname in ('files_kind_check', 'files_kind_mime')")).toBe(2);
    });

    it("the child's tutor and the parent read through RLS; the student, the other child's tutor and anon read nothing", async () => {
      await insertDecision(NG(), { client_id: "rls-ng-0001", domain_key: "speaking" });
      await insertExternal(NG());
      const count = async (user: string, t: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", user, `select count(*)::int as n from english.${t} where learner_id = $1`, [NG()]))[0]?.n;
      for (const t of ["level_decisions", "external_results"]) {
        expect(await count(s.users.tutorNguyen, t), t).toBeGreaterThan(0);
        expect(await count(s.users.parent, t), t).toBeGreaterThan(0);
        expect(await count(s.users.studentNguyen, t), t).toBe(0);
        expect(await count(s.users.tutorAn, t), t).toBe(0);
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('anon', 'english.${t}', 'select') as ok`))[0]?.ok, t).toBe(false);
      }
    });

    it("purge: the dry run counts both books and the purge deletes them and the file row, with a matching receipt", async () => {
      const L = await newLearner("B");
      const fileId = randomUUID();
      await q1(`insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, 'external_result', $4, 'application/pdf', 100, $5)`,
        [fileId, s.familyId, L, `${s.familyId}/${L}/${fileId}.pdf`, M().parent]);
      await insertDecision(L);
      await insertExternal(L, { file_id: fileId });
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect([dry.counts.level_decisions, dry.counts.external_results, dry.counts.files]).toEqual([1, 1, 1]);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toEqual(dry.counts);
      expect(await n(`select ((select count(*) from english.level_decisions where learner_id = $1) + (select count(*) from english.external_results where learner_id = $1)
                      + (select count(*) from english.files where learner_id = $1))::int as n`, [L])).toBe(0);
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.level_decisions)::int as d, (select count(*) from english.external_results)::int as e");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.level_decisions)::int as d, (select count(*) from english.external_results)::int as e")).toEqual(before);
    });
  });

  // (Tasks 2 and 3 add their sections here)
});
