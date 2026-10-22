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
  const ext = (by: string, o: { learner?: string; exam?: string; takenOn?: string; score?: string; domains?: string[]; note?: string | null; file?: unknown; clientId?: string; supersedes?: string } = {}) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_record_external_result($1, $2, $3::date, $4, $5::text[], $6, $7::jsonb, $8, $9, $10) as r", [
      o.learner ?? NG(), o.exam ?? "FCE", o.takenOn ?? addDays(TODAY, -30), o.score ?? "172 · Grade B", o.domains ?? ["reading", "listening"],
      o.note ?? null, o.file === undefined ? null : JSON.stringify(o.file), by, o.clientId ?? randomUUID(), o.supersedes ?? null,
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

  describe("2. recording levels", () => {
    it("the child's tutor confirms several starting levels at once; 'from' is the track's assumed level; replay returns the same rows", async () => {
      const L = await newLearner("B");
      const r = await rec(M().tutorNguyen, { learner: L, levels: { thinking: "3", grammar: "B2+", reading: "B2" }, reason: "Buổi đầu", clientId: "lvl-base-0001" });
      expect([r.ids.length, r.replayed]).toEqual([3, false]);
      expect(await q1("select domain_key, from_level, to_level, kind, reason, decided_role, map_id from english.level_decisions where learner_id = $1 order by domain_key", [L])).toEqual([
        { domain_key: "grammar", from_level: "B2", to_level: "B2+", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
        { domain_key: "reading", from_level: "B2", to_level: "B2", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
        { domain_key: "thinking", from_level: "2", to_level: "3", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
      ]);
      expect(await rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2+", reading: "B2", thinking: "3" }, reason: "Buổi đầu", clientId: "lvl-base-0001" })).toEqual({ ids: r.ids, replayed: true });
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "C1", reading: "B2", thinking: "3" }, reason: "Buổi đầu", clientId: "lvl-base-0001" }), "23505");
      expect((await q1<{ evidence: unknown; policy_version: string | null }>("select evidence, policy_version from english.level_decisions where learner_id = $1 and domain_key = 'grammar'", [L]))[0])
        .toEqual({ evidence: { basis: "tutor_judgement", assumed_level: "B2", latest_external_result_id: null }, policy_version: null });
      // a child with a skill set records the policy of that set
      await rec(M().tutorNguyen, { levels: { grammar: "B2" } });
      expect((await q1<{ p: string }>("select policy_version as p from english.level_decisions where learner_id = $1 and domain_key = 'grammar'", [NG()]))[0]?.p).toBe("AP-0.2-pilot");
    });

    it("baseline once per domain; adjust needs a baseline, one domain, a different level and a reason; going down is allowed", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2+" } });
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2" } }), "23505", /\(already_confirmed\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { listening: "B1+" }, reason: "Nghe còn yếu" }), "23514", /\(needs_baseline\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" } }), "23514", /\(reason_required\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" }, reason: "   " }), "23514", /\(reason_required\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2", vocab: "B2" }, reason: "x" }), "22023", /\(bad_level\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2+" }, reason: "x" }), "23514", /\(same_level\)/);
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" }, reason: "Bài viết gần đây còn nhiều lỗi thì" });
      expect(await q1("select from_level, to_level, kind, reason from english.level_decisions where learner_id = $1 and domain_key = 'grammar' order by decided_at", [L])).toEqual([
        { from_level: "B2", to_level: "B2+", kind: "baseline", reason: null },
        { from_level: "B2+", to_level: "B2", kind: "adjust", reason: "Bài viết gần đây còn nhiều lỗi thì" },
      ]);
    });

    it("each level must fit its domain's scale; unknown domains, level_up, other kinds and long reasons are refused", async () => {
      const L = await newLearner("A");
      for (const levels of [{ thinking: "B1" }, { grammar: "3" }, { grammar: "B3" }, { music: "B1" }, {}, { grammar: 2 }, ["grammar"]]) {
        await fail(rec(M().tutorNguyen, { learner: L, levels }), "22023", /\(bad_level\)/);
      }
      await fail(rec(M().tutorNguyen, { learner: L, kind: "level_up", levels: { grammar: "B1" } }), "22023", /\(level_up_reserved\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "promote", levels: { grammar: "B1" } }), "22023");
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "A2" }, reason: "x".repeat(301) }), "22023", /\(reason_too_long\)/);
      expect(await n("select count(*)::int as n from english.level_decisions where learner_id = $1", [L])).toBe(0);
    });

    it("only a tutor with an active relationship: the parent, the other child's tutor, a past tutor, the student and strangers are refused", async () => {
      for (const by of [M().parent, M().tutorAn, oldTutor, M().studentNguyen, randomUUID()]) {
        await fail(rec(by, { levels: { vocab: "B2" } }), "42501", /\(tutor_only\)/);
      }
      await fail(rec(M().tutorNguyen, { learner: randomUUID(), levels: { vocab: "B2" } }), "P0002");
    });

    it("writes an audit row without the reason", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { writing: "B1+" }, reason: "Chi tiết riêng tư" });
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'level.recorded' and learner_id = $1", [L]);
      expect(log[0]?.payload).toEqual({ kind: "baseline", map_id: "SM-1", domains: ["writing"] });
    });
  });

  describe("3. recording external results", () => {
    it("the parent or the tutor records one, with or without a file; replay returns it; a reused client id or file is refused", async () => {
      const a = await ext(M().parent, { clientId: "ext-0000-0001", domains: ["reading", "listening", "reading"] });
      expect(a.replayed).toBe(false);
      expect(await ext(M().parent, { clientId: "ext-0000-0001", domains: ["listening", "reading"] })).toEqual({ id: a.id, replayed: true });
      await fail(ext(M().parent, { clientId: "ext-0000-0001", score: "180" }), "23505");
      expect((await q1("select exam, score_text, domains, recorded_role, file_id from english.external_results where id = $1", [a.id]))[0])
        .toEqual({ exam: "FCE", score_text: "172 · Grade B", domains: ["listening", "reading"], recorded_role: "parent", file_id: null });
      const fileId = randomUUID();
      const b = await ext(M().tutorNguyen, { exam: "VAO10_MOCK", score: "8,5/10", domains: ["grammar"], file: { id: fileId, mime: "application/pdf", bytes: 2048 } });
      expect((await q1("select kind, path, learner_id from english.files where id = $1", [fileId]))[0]).toEqual({
        kind: "external_result", path: `${s.familyId}/${NG()}/${fileId}.pdf`, learner_id: NG(),
      });
      expect((await q1<{ f: string }>("select file_id::text as f from english.external_results where id = $1", [b.id]))[0]?.f).toBe(fileId);
      await fail(ext(M().tutorNguyen, { file: { id: fileId, mime: "application/pdf", bytes: 2048 } }), "23505");
    });

    it("refuses a future or very old date, unknown exams and domains, an empty score, a long note, and members outside the child", async () => {
      await fail(ext(M().parent, { takenOn: addDays(TODAY, 1) }), "23514", /\(bad_date\)/);
      await fail(ext(M().parent, { takenOn: addDays(TODAY, -3700) }), "23514", /\(bad_date\)/);
      await fail(ext(M().parent, { exam: "IELTS" }), "22023", /\(bad_exam\)/);
      await fail(ext(M().parent, { domains: [] }), "22023", /\(bad_domains\)/);
      await fail(ext(M().parent, { domains: ["music"] }), "22023", /\(bad_domains\)/);
      await fail(ext(M().parent, { score: "   " }), "22023");
      await fail(ext(M().parent, { note: "n".repeat(301) }), "22023", /\(note_too_long\)/);
      for (const by of [M().tutorAn, oldTutor, M().studentNguyen, randomUUID()]) await fail(ext(by), "42501");
    });

    it("the audit row names the kind of result, never the score or the note; both write functions are service_role only", async () => {
      const r = await ext(M().parent, { note: "Riêng tư" });
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'external_result.recorded' and payload ->> 'result_id' = $1", [r.id]);
      expect(Object.keys(log[0]!.payload).sort()).toEqual(["domains", "exam", "has_file", "result_id"]);
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'english' and p.proname in ('eng_record_level', 'eng_record_external_result')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc], a.proname).toEqual([false, false, true]);
    });

    it("a correction is a new row that replaces an old one: once per row, same child only, tutor or parent only, audited as corrected", async () => {
      const L = await newLearner("B");
      const first = await ext(M().parent, { learner: L, score: "165", clientId: "ext-corr-0001" });
      const fixed = await ext(M().tutorNguyen, { learner: L, score: "172", clientId: "ext-corr-0002", supersedes: first.id });
      expect(fixed.replayed).toBe(false);
      expect(await ext(M().tutorNguyen, { learner: L, score: "172", clientId: "ext-corr-0002", supersedes: first.id })).toEqual({ id: fixed.id, replayed: true });
      expect(await q1("select score_text, supersedes_id from english.external_results where learner_id = $1 order by recorded_at", [L])).toEqual([
        { score_text: "165", supersedes_id: null },
        { score_text: "172", supersedes_id: first.id },
      ]);
      await fail(ext(M().parent, { learner: L, score: "180", supersedes: first.id }), "23505", /\(already_superseded\)/);
      // the replacement can be corrected in turn
      await ext(M().parent, { learner: L, score: "175", supersedes: fixed.id });
      // a row of another child, or a missing row, is not found; the actor must be in scope of the child
      const other = await ext(M().parent, { learner: NG(), clientId: "ext-corr-0003" });
      await fail(ext(M().parent, { learner: L, supersedes: other.id }), "P0002", /\(not_found\)/);
      await fail(ext(M().parent, { learner: L, supersedes: randomUUID() }), "P0002", /\(not_found\)/);
      for (const by of [M().tutorAn, oldTutor, M().studentNguyen, randomUUID()]) {
        const target = await ext(M().parent, { learner: L, clientId: `ext-corr-${randomUUID().slice(0, 8)}` });
        await fail(ext(by, { learner: L, supersedes: target.id }), "42501");
      }
      const log = await q1<{ action: string; payload: Record<string, unknown> }>(
        "select action, payload from english.audit_log where action = 'external_result.corrected' and payload ->> 'result_id' = $1", [fixed.id]);
      expect(log).toHaveLength(1);
      expect(Object.keys(log[0]!.payload).sort()).toEqual(["domains", "exam", "has_file", "result_id", "supersedes_id"]);
      // append-only still: the old row cannot be touched
      const err = await db.client.query("update english.external_results set score_text = 'x' where id = $1", [first.id]).then(() => null, (e: unknown) => e as { code?: string });
      expect(err?.code).toBe("42501");
    });
  });


  describe("4. reading the profile", () => {
    type Dom = { key: string; current_level: string; assumed_level: string; status: string; last_kind: string | null; decided_by_name: string | null; external: { exam: string } | null };
    type Profile = {
      map_id: string; track_id: string; domains: Dom[]; history: { domain_key: string; kind: string; to_level: string }[];
      external_results: { exam: string }[]; reading_reports: { month: string; skills: number }[];
    };
    const profile = (l: string) => svc<Profile>("select english.eng_level_profile($1) as r", [l]);

    it("a new Track A child: 7 domains in map order, all assumed (A2, thinking 1), nothing in history", async () => {
      const L = await newLearner("A");
      const p = await profile(L);
      expect([p.map_id, p.track_id]).toEqual(["SM-1", "A"]);
      expect(p.domains.map((d) => [d.key, d.current_level, d.status])).toEqual([
        ["grammar", "A2", "assumed"], ["vocab", "A2", "assumed"], ["reading", "A2", "assumed"], ["listening", "A2", "assumed"],
        ["writing", "A2", "assumed"], ["speaking", "A2", "assumed"], ["thinking", "1", "assumed"],
      ]);
      expect([p.history, p.external_results, p.reading_reports]).toEqual([[], [], []]);
    });

    it("the latest decision wins; who decided; the newest external result per domain; history newest first", async () => {
      const L = await newLearner("A");
      await rec(M().tutorNguyen, { learner: L, levels: { grammar: "A2+", reading: "A2" } });
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B1" }, reason: "Làm tốt 3 bài kiểm tra" });
      await ext(M().parent, { learner: L, exam: "KET", takenOn: addDays(TODAY, -200), domains: ["reading", "listening"] });
      await ext(M().parent, { learner: L, exam: "PET", takenOn: addDays(TODAY, -10), domains: ["reading"] });
      const p = await profile(L);
      const by = new Map(p.domains.map((d) => [d.key, d]));
      expect(by.get("grammar")).toMatchObject({ current_level: "B1", assumed_level: "A2", status: "confirmed", last_kind: "adjust", decided_by_name: "Cô của Nguyên (thử)" });
      expect(by.get("reading")).toMatchObject({ current_level: "A2", status: "confirmed", external: { exam: "PET" } });
      expect(by.get("listening")).toMatchObject({ status: "assumed", external: { exam: "KET" } });
      expect(by.get("vocab")?.external).toBeNull();
      expect(p.history.map((h) => [h.domain_key, h.kind, h.to_level])).toEqual([["grammar", "adjust", "B1"], ["reading", "baseline", "A2"], ["grammar", "baseline", "A2+"]]);
      expect(p.external_results.map((e) => e.exam)).toEqual(["PET", "KET"]);
    });

    it("current monthly reading reports appear as months only, never with their source name", async () => {
      const L = await newLearner("A");
      const month = `${TODAY.slice(0, 7)}-01`;
      await svc("select english.eng_record_reading_report($1, $2::date, null, $3::jsonb, null, null, $4, $5) as r",
        [L, month, JSON.stringify([{ tag_key: "doc-main-idea", questions: 6, correct_pct: 50 }]), M().parent, randomUUID()]);
      const p = await profile(L);
      expect(p.reading_reports).toEqual([{ month, skills: 1 }]);
      expect(JSON.stringify(p)).not.toMatch(/tomo/i);
    });

    it("recent changes: last p_days days, newest first, with the domain name and scale; older rows are left out", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { thinking: "3" } });
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { thinking: "2" }, reason: "Chưa tự lập luận được" });
      // an old decision, inserted by the owner as if made 40 days ago
      await q1(`insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, decided_by_member, decided_role, client_id, decided_at)
                values ($1, 'grammar', 'SM-1', 'B2', 'B2', 'baseline', $2, 'tutor', 'old-decision-1', now() - interval '40 days')`, [L, M().tutorNguyen]);
      type Change = { domain_key: string; domain_name: string; scale: string; from_level: string; to_level: string; kind: string; reason: string | null };
      const r = await svc<{ changes: Change[] }>("select english.eng_recent_level_changes($1, 30) as r", [L]);
      expect(r.changes.map((c) => [c.domain_key, c.domain_name, c.scale, c.from_level, c.to_level, c.kind, c.reason])).toEqual([
        ["thinking", "Tư duy & tự học", "task_level", "3", "2", "adjust", "Chưa tự lập luận được"],
        ["thinking", "Tư duy & tự học", "task_level", "2", "3", "baseline", null],
      ]);
      expect((await svc<{ changes: unknown[] }>("select english.eng_recent_level_changes($1, 60) as r", [L])).changes).toHaveLength(3);
    });

    it("a corrected external result: the profile lists only the replacement (and what it replaced); the domain's latest mark is the replacement", async () => {
      const L = await newLearner("B");
      const first = await ext(M().parent, { learner: L, exam: "FCE", score: "165", domains: ["reading"], clientId: "ext-prof-0001" });
      const fixed = await ext(M().parent, { learner: L, exam: "FCE", score: "172", domains: ["reading"], clientId: "ext-prof-0002", supersedes: first.id });
      const p = await svc<{ domains: { key: string; external: { id: string; score_text: string } | null }[];
        external_results: { id: string; score_text: string; replaces: { id: string; score_text: string } | null }[] }>("select english.eng_level_profile($1) as r", [L]);
      expect(p.external_results.map((e) => [e.id, e.score_text, e.replaces?.id ?? null, e.replaces?.score_text ?? null])).toEqual([[fixed.id, "172", first.id, "165"]]);
      expect(p.domains.find((d) => d.key === "reading")?.external).toMatchObject({ id: fixed.id, score_text: "172" });
      // the purge counts and removes both rows
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts.external_results).toBe(2);
      await svc("select english.eng_purge_learner($1, $2) as r", [L, s.users.parent]);
      expect(await n("select count(*)::int as n from english.external_results where learner_id = $1", [L])).toBe(0);
    });

    it("S1: a correction without a new sheet keeps the original sheet (inherited down the whole chain); a new sheet replaces it", async () => {
      const L = await newLearner("B");
      const sheet = randomUUID();
      type Row = { id: string; file_id: string | null; file_inherited: boolean; replaces: { file_id: string | null } | null };
      const live = async () => (await svc<{ external_results: Row[] }>("select english.eng_level_profile($1) as r", [L])).external_results;
      const first = await ext(M().parent, { learner: L, clientId: "ext-sheet-0001", file: { id: sheet, mime: "application/pdf", bytes: 2048 } });
      expect(await live()).toMatchObject([{ id: first.id, file_id: sheet, file_inherited: false }]);
      const second = await ext(M().parent, { learner: L, clientId: "ext-sheet-0002", supersedes: first.id });
      const third = await ext(M().tutorNguyen, { learner: L, clientId: "ext-sheet-0003", supersedes: second.id });
      const rows = await live();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: third.id, file_id: sheet, file_inherited: true });
      expect(rows[0]!.replaces?.file_id).toBeNull(); // `replaces` still describes the direct predecessor only
      // a newer sheet wins over the inherited one
      const sheet2 = randomUUID();
      const fourth = await ext(M().parent, { learner: L, clientId: "ext-sheet-0004", supersedes: third.id, file: { id: sheet2, mime: "image/png", bytes: 500 } });
      expect(await live()).toMatchObject([{ id: fourth.id, file_id: sheet2, file_inherited: false }]);
      // a chain that never had a sheet stays without one
      const bare = await newLearner("B");
      const b1 = await ext(M().parent, { learner: bare, clientId: "ext-bare-0001" });
      await ext(M().parent, { learner: bare, clientId: "ext-bare-0002", supersedes: b1.id });
      const bareRows = (await svc<{ external_results: Row[] }>("select english.eng_level_profile($1) as r", [bare])).external_results;
      expect(bareRows).toMatchObject([{ file_id: null, file_inherited: false }]);
    });

    it("eng_external_result: one entry by id for the correction form - live, already corrected, or not found (any family, any child)", async () => {
      const L = await newLearner("B");
      const first = await ext(M().parent, { learner: L, score: "165", clientId: "ext-one-0001", note: "ghi chú" });
      const fixed = await ext(M().parent, { learner: L, score: "172", clientId: "ext-one-0002", supersedes: first.id });
      type One = { state: string; result: { id: string; score_text: string; domains: string[]; note: string | null } | null };
      const one = (learner: string, id: string) => svc<One>("select english.eng_external_result($1, $2) as r", [learner, id]);
      expect(await one(L, fixed.id)).toMatchObject({ state: "live", result: { id: fixed.id, score_text: "172", domains: ["listening", "reading"] } });
      expect(await one(L, first.id)).toEqual({ state: "superseded", result: null });
      expect(await one(L, randomUUID())).toEqual({ state: "not_found", result: null });
      // another child's row, and a row of another family, are "not found" for this child
      const mine = await ext(M().parent, { learner: NG(), clientId: "ext-one-0003" });
      expect(await one(L, mine.id)).toEqual({ state: "not_found", result: null });
      const otherFamily = (await q1<{ id: string }>("insert into english.families(name) values ('Gia đình khác') returning id"))[0]!.id;
      const stranger = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Em lạ', 'B', true, 'active') returning id", [otherFamily]))[0]!.id;
      const strangerMember = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'PH lạ') returning id", [await createAuthUser(db.client, `stranger-${randomUUID().slice(0, 6)}@test.local`), otherFamily]))[0]!.id;
      const foreign = await ext(strangerMember, { learner: stranger, clientId: "ext-one-0004" });
      expect(await one(L, foreign.id)).toEqual({ state: "not_found", result: null });
      // a correction may not point at another family's row either
      await fail(ext(M().parent, { learner: L, supersedes: foreign.id }), "P0002", /\(not_found\)/);
      const err = await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select english.eng_external_result($1, $2) as r", [NG(), mine.id]).then(() => null, (e: unknown) => e as { code?: string });
      expect(err?.code).toBe("42501");
    });

    it("the staff reads are closed to anon and authenticated (a student calling it is refused)", async () => {
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'english' and p.proname in ('eng_level_profile', 'eng_recent_level_changes')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc], a.proname).toEqual([false, false, true]);
      const err = await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select english.eng_level_profile($1) as r", [NG()])
        .then(() => null, (e: unknown) => e as { code?: string });
      expect(err?.code).toBe("42501");
    });
  });

  describe("5. the student's 'Việc cần ôn' by domain", () => {
    it("lists at most 3 due tags with only a label and a domain name; no level, score, count or date", async () => {
      // 4 wrong items 20 days ago, on 4 tags of 4 domains: with the 14-day policy of B-v1 all 4 are due for a re-check
      await svc("select english.eng_record_result($1, 'quick', null, 'Ôn tập tháng', 10, 6, '{1,2,3,4}', $2::jsonb, 'home', 'first', false, $3::date, null, null, $4, $5, 'test') as r", [
        NG(),
        JSON.stringify([{ n: 1, tag_key: "modal-suy-doan" }, { n: 2, tag_key: "dang-tu" }, { n: 3, tag_key: "phat-am" }, { n: 4, tag_key: "doc-inference" }]),
        addDays(TODAY, -20), M().tutorNguyen, randomUUID(),
      ]);
      const [row] = await rowsAs<{ r: { items: Record<string, unknown>[] } }>(db.client, "authenticated", s.users.studentNguyen, "select english.eng_my_review_by_domain() as r");
      const items = row!.r.items;
      expect(items).toHaveLength(3);
      const names = new Map([["grammar", "Ngữ pháp"], ["vocab", "Từ vựng"], ["speaking", "Nói"], ["reading", "Đọc"]]);
      for (const it of items) {
        expect(Object.keys(it).sort()).toEqual(["domain_key", "domain_name", "label"]);
        expect(names.get(String(it.domain_key))).toBe(it.domain_name);
      }
      expect(JSON.stringify(row)).not.toMatch(/B2|\/4|20\d\d-/);
    });

    it("a tutor, a parent or another student without due tags gets an empty list; service_role and anon cannot call it", async () => {
      for (const u of [s.users.tutorNguyen, s.users.parent, s.users.studentAn]) {
        const [row] = await rowsAs<{ r: { items: unknown[] } }>(db.client, "authenticated", u, "select english.eng_my_review_by_domain() as r");
        expect(row!.r.items, u).toEqual([]);
      }
      expect((await q1<{ s: boolean; a: boolean }>(`select has_function_privilege('service_role', 'english.eng_my_review_by_domain()', 'execute') as s,
                                                          has_function_privilege('anon', 'english.eng_my_review_by_domain()', 'execute') as a`))[0]).toEqual({ s: false, a: false });
    });
  });
});
