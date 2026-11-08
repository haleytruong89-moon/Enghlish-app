import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** W2 · Giáo trình (migration 0026): tables, guards, RLS, functions, listening tags, AI purpose, lesson note v3, purge. One database. */
describe("W2 curriculum (migration 0026)", () => {
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
  const AN = () => s.learners.an;
  const pdf = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 2048 });
  type Created = { curriculum_id: string; version_id: string; status: string; replayed: boolean };
  const create = (by: string, o: { learner?: string; title?: string; note?: string | null; file?: unknown; extract?: boolean; clientId?: string } = {}) =>
    svc<Created>("select english.eng_create_curriculum($1,$2,$3,$4::jsonb,$5,$6,$7) as r", [
      o.learner ?? NG(), o.title ?? "Destination C1&C2", o.note === undefined ? "C1–C2" : o.note,
      o.file === undefined ? null : JSON.stringify(o.file), o.extract ?? false, by, o.clientId ?? randomUUID(),
    ]);
  const updatedAt = async (v: string) => (await q1<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v]))[0]!.t;
  const unitRow = (n: number, points: string[] = [], extra: Record<string, unknown> = {}) => ({
    code: `U${n}`, title: `Unit ${n}`, section: n % 2 ? "Grammar" : "Vocabulary", page: 6 * n, skipped: false, points,
    missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null, ...extra,
  });
  const save = async (v: string, units: unknown[], by = M().tutorNguyen) =>
    svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [v, JSON.stringify({ units, ignored: [] }), await updatedAt(v), by]);
  const finalOf = (units: ReturnType<typeof unitRow>[]) =>
    units.filter((u) => !u.dropped).map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
  const approve = async (v: string, units: ReturnType<typeof unitRow>[], by = M().tutorNguyen, review: unknown = null) =>
    svc<{ version_id: string; version: number; units: number }>("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,$4::jsonb,$5) as r", [
      v, await updatedAt(v), JSON.stringify(finalOf(units)), review === null ? null : JSON.stringify(review), by,
    ]);
  const setStatus = (cur: string, code: string, status: string, by = M().tutorNguyen, clientId: string = randomUUID(), note: string | null = null) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_set_unit_status($1,$2,$3,$4,$5,$6) as r", [cur, code, status, note, by, clientId]);
  const twentySix = () => Array.from({ length: 26 }, (_, i) => unitRow(i + 1, i === 6 ? ["bi-dong-nho-tuong-thuat"] : i % 2 ? ["cum-dong-tu", "thanh-ngu"] : []));

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. tables and reading rights", () => {
    it("exist, refuse direct writes even from service_role", async () => {
      for (const t of ["curricula", "curriculum_versions", "curriculum_units", "curriculum_unit_points", "curriculum_unit_events", "lesson_note_units"]) {
        expect((await q1("select to_regclass($1)::text as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc(
        "insert into english.curricula(family_id, learner_id, track_id, title, created_by_member, client_id) values ($1,$2,'B','x',$3,'raw-00000001') returning id as r",
        [s.familyId, NG(), M().tutorNguyen]), "42501");
    });
    it("the child's tutor and the parent read; the other tutor and students read nothing", async () => {
      // written as the table owner (the app writes through the functions of Task 2)
      await q1("insert into english.curricula(family_id, learner_id, track_id, title, level_note, created_by_member, client_id) values ($1,$2,'B','Reading Explorer 3','Quyển 3 ≈ B1+',$3,'raw-00000002')",
        [s.familyId, NG(), M().tutorNguyen]);
      const n = async (uid: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.curricula where learner_id = $1", [NG()]))[0]!.n;
      expect(await n(s.users.tutorNguyen)).toBe(1);
      expect(await n(s.users.parent)).toBe(1);
      expect(await n(s.users.tutorAn)).toBe(0);
      expect(await n(s.users.studentNguyen)).toBe(0);
    });
  });

  describe("2. adding a curriculum", () => {
    it("tutor or parent adds one (v1 'draft' for Soạn tay); the tutor of the other child cannot; a replay returns the same rows", async () => {
      const id = randomUUID();
      const a = await create(M().parent, { title: "SGK Tiếng Anh 9", note: null, clientId: `cur-${id}` });
      expect(a).toMatchObject({ status: "draft", replayed: false });
      expect(await create(M().parent, { title: "SGK Tiếng Anh 9", note: null, clientId: `cur-${id}` })).toEqual({ ...a, replayed: true });
      await fail(create(M().parent, { title: "Khác", clientId: `cur-${id}` }), "23505");
      await fail(create(M().tutorAn), "42501");
      await fail(create(M().studentNguyen), "42501");
      await fail(create(M().tutorNguyen, { title: "  " }), "22023", /\(bad_title\)/);
    });
    it("AI mode needs a PDF table of contents; the file is registered as curriculum_toc; Word is refused", async () => {
      await fail(create(M().tutorNguyen, { extract: true }), "22023", /\(toc_file_required\)/);
      const f = pdf();
      const r = await create(M().tutorNguyen, { extract: true, file: f });
      expect(r.status).toBe("extracting");
      expect(await q1("select kind, mime from english.files where id = $1", [f.id])).toEqual([{ kind: "curriculum_toc", mime: "application/pdf" }]);
      await fail(create(M().tutorNguyen, { extract: true, file: { id: randomUUID(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 10 } }), "22023");
    });
  });

  describe("2b. Nạp mục lục for an existing curriculum", () => {
    it("after v1 is discarded a new version can be read from a PDF; an open draft is returned instead of a second one", async () => {
      const c = await create(M().tutorNguyen, { title: "Listening & Notetaking 1" });
      await svc("select english.eng_discard_curriculum_draft($1,$2) as r", [c.version_id, M().tutorNguyen]);
      const id = `ver-${randomUUID()}`;
      const add = (clientId: string, extract = true) =>
        svc<{ version_id: string; status: string; replayed: boolean }>("select english.eng_add_curriculum_version($1,$2::jsonb,$3,$4,$5) as r",
          [c.curriculum_id, extract ? JSON.stringify(pdf()) : null, extract, M().parent, clientId]);
      const v = await add(id);
      expect(v).toMatchObject({ status: "extracting", replayed: false });
      expect(await add(id)).toEqual({ ...v, replayed: true });
      expect(await add(randomUUID(), false)).toEqual({ ...v, replayed: true });
      expect(await q1("select version, source from english.curriculum_versions where id = $1", [v.version_id])).toEqual([{ version: 2, source: "ai" }]);
      await fail(svc("select english.eng_add_curriculum_version($1,null,true,$2,$3) as r", [c.curriculum_id, M().tutorAn, randomUUID()]), "42501");
    });
  });

  describe("3. AI draft → review → approve (tutor only) → immutable", () => {
    let cur = "";
    let v1 = "";
    it("finish writes payload AND ai_payload once; ai_payload never changes afterwards", async () => {
      const r = await create(M().tutorNguyen, { extract: true, file: pdf() });
      cur = r.curriculum_id;
      v1 = r.version_id;
      const payload = { units: [unitRow(1, [], { needs_review: true, review_reason: "Không có nhãn thì hiện tại" }), unitRow(2, ["cum-dong-tu"])], ignored: [] };
      expect(await svc("select english.eng_finish_curriculum_extraction($1,$2::jsonb,null) as r", [v1, JSON.stringify(payload)])).toEqual({ applied: true });
      expect(await svc("select english.eng_finish_curriculum_extraction($1,$2::jsonb,null) as r", [v1, JSON.stringify(payload)])).toEqual({ applied: false });
      await save(v1, [unitRow(1), unitRow(2, ["cum-dong-tu"])]);
      expect((await q1<{ n: number }>("select jsonb_array_length(ai_payload->'units') as n from english.curriculum_versions where id = $1", [v1]))[0]!.n).toBe(2);
      await fail(q1("update english.curriculum_versions set ai_payload = '{}'::jsonb where id = $1", [v1]), "42501");
    });
    it("Duyệt is refused while a row still needs a look, for the parent, for a stale base, and for a point outside the closed list", async () => {
      const units = twentySix();
      units[0] = { ...units[0]!, needs_review: true };
      await save(v1, units);
      await fail(approve(v1, units), "23514", /\(needs_review_left\)/);
      units[0] = { ...units[0]!, needs_review: false };
      await save(v1, units);
      await fail(approve(v1, units, M().parent), "42501", /\(tutor_only\)/);
      await fail(approve(v1, units, M().tutorAn), "42501", /\(tutor_only\)/);
      const bad = units.map((u, i) => (i === 3 ? { ...u, points: ["khong-co-nhan-nay"] } : u));
      await fail(approve(v1, bad), "23514", /\(unknown_point\)/);
      const dup = units.map((u, i) => (i === 4 ? { ...u, code: "U1" } : u));
      await fail(approve(v1, dup), "23514", /\(duplicate_code\)/);
      await fail(svc("select english.eng_approve_curriculum_version($1,'2020-01-01 00:00:00+00',$2::jsonb,null,$3) as r",
        [v1, JSON.stringify(finalOf(units)), M().tutorNguyen]), "23505", /\(draft_changed\)/);
    });
    it("the tutor approves: 26 units in order + their points; then nothing of v1 can change", async () => {
      expect(await approve(v1, twentySix(), M().tutorNguyen, { stats: { ai_rows: 2, edited: 1 }, quality: "ok", quality_note: null }))
        .toEqual({ version_id: v1, version: 1, units: 26 });
      expect((await q1<{ code: string }>("select code from english.curriculum_units where version_id = $1 order by ord", [v1])).map((r) => r.code))
        .toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
      expect(await q1("select tag_key from english.curriculum_unit_points where version_id = $1 and code = 'U7'", [v1])).toEqual([{ tag_key: "bi-dong-nho-tuong-thuat" }]);
      await fail(q1("update english.curriculum_units set title = 'x' where version_id = $1", [v1]), "42501");
      await fail(q1("delete from english.curriculum_unit_points where version_id = $1", [v1]), "42501");
      await fail(q1("update english.curriculum_versions set payload = '{\"units\":[],\"ignored\":[]}'::jsonb where id = $1", [v1]), "42501");
      await fail(q1("insert into english.curriculum_units(version_id, curriculum_id, learner_id, code, ord, title) values ($1,$2,$3,'U99',99,'x')", [v1, cur, NG()]), "42501");
      await fail(svc("select english.eng_save_curriculum_draft($1,'{\"units\":[],\"ignored\":[]}'::jsonb,$2,$3) as r", [v1, await updatedAt(v1), M().tutorNguyen]), "23514", /\(not_editable\)/);
    });

    it("unit status: events only; unknown units refused; the parent may set; a replay is the same event", async () => {
      const id = `ev-${randomUUID()}`;
      const a = await setStatus(cur, "U13", "in_progress", M().tutorNguyen, id);
      expect(await setStatus(cur, "U13", "in_progress", M().tutorNguyen, id)).toEqual({ ...a, replayed: true });
      await fail(setStatus(cur, "U13", "done", M().tutorNguyen, id), "23505");
      await setStatus(cur, "U3", "skipped", M().parent);
      await fail(setStatus(cur, "U99", "done"), "23514", /\(unknown_unit\)/);
      await fail(setStatus(cur, "U1", "finished"), "22023", /\(bad_status\)/);
      await fail(setStatus(cur, "U1", "done", M().tutorAn), "42501");
      await fail(q1("update english.curriculum_unit_events set status = 'done' where curriculum_id = $1", [cur]), "42501");
    });

    it("edit after approval = v2 draft with the same unit codes; v2 drops U20 and adds U27; v1 becomes superseded; events still count by code", async () => {
      const e = await svc<{ id: string; replayed: boolean }>("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().parent, randomUUID()]);
      expect(e.replayed).toBe(false);
      expect(await svc("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().tutorNguyen, randomUUID()])).toEqual({ id: e.id, replayed: true });
      const p = (await q1<{ codes: string[] }>("select array(select x->>'code' from jsonb_array_elements(payload->'units') x) as codes from english.curriculum_versions where id = $1", [e.id]))[0]!.codes;
      expect(p).toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
      const v2 = twentySix().filter((u) => u.code !== "U20").concat([unitRow(27, [], { origin: "manual" })]);
      await save(e.id, v2);
      expect((await approve(e.id, v2)).version).toBe(2);
      expect(await q1("select version, status from english.curriculum_versions where curriculum_id = $1 order by version", [cur])).toEqual([
        { version: 1, status: "superseded" }, { version: 2, status: "approved" },
      ]);
      expect(await q1("select count(*)::int as n from english.curriculum_units where version_id = $1", [v1])).toEqual([{ n: 26 }]); // history kept
      await fail(setStatus(cur, "U20", "done"), "23514", /\(unknown_unit\)/);
      expect((await setStatus(cur, "U27", "in_progress")).replayed).toBe(false);
    });

    it("the parent may discard a draft; nobody discards an approved version", async () => {
      const e = await svc<{ id: string }>("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().tutorNguyen, randomUUID()]);
      expect(await svc("select english.eng_discard_curriculum_draft($1,$2) as r", [e.id, M().parent])).toEqual({ id: e.id, status: "discarded" });
      const current = (await q1<{ id: string }>("select id from english.curriculum_versions where curriculum_id = $1 and status = 'approved'", [cur]))[0]!.id;
      await fail(svc("select english.eng_discard_curriculum_draft($1,$2) as r", [current, M().parent]), "23514", /\(not_editable\)/);
    });
  });


  describe("4. AI purpose and listening tags", () => {
    it("reservation and release carry the purpose; old calls (no purpose) still mean studio_extract", async () => {
      await q1("insert into english.ai_settings(family_id, enabled) values ($1, true) on conflict (family_id) do update set enabled = true", [s.familyId]);
      await q1("insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by) values ($1,$2,'ai-studio-v1','ai_text',true,$2)", [NG(), M().parent]);
      const g = await svc<{ allowed: boolean; reservation_id: string }>("select english.eng_ai_gate($1, 0.2, true, null, 'claude-sonnet-5-5', $2, 'curriculum_toc') as r", [NG(), M().tutorNguyen]);
      expect(g.allowed).toBe(true);
      expect(await q1("select purpose from english.ai_runs where id = $1", [g.reservation_id])).toEqual([{ purpose: "curriculum_toc" }]);
      await fail(svc("select english.eng_log_ai_run($1,null,'claude-sonnet-5-5','curriculum-toc.v1',10,10,0.01,'ok',null,$2,$3,'studio_extract') as r", [s.familyId, M().tutorNguyen, g.reservation_id]), "23514", /\(bad_release\)/);
      const run = await svc<string>("select english.eng_log_ai_run($1,null,'claude-sonnet-5-5','curriculum-toc.v1',10,10,0.01,'ok',null,$2,$3,'curriculum_toc') as r", [s.familyId, M().tutorNguyen, g.reservation_id]);
      expect(await q1("select purpose, prompt_version from english.ai_runs where id = $1", [run])).toEqual([{ purpose: "curriculum_toc", prompt_version: "curriculum-toc.v1" }]);
      const old = await svc<{ reservation_id: string }>("select english.eng_ai_gate($1, 0.1, true, null, 'claude-sonnet-5-5', $2) as r", [NG(), M().tutorNguyen]);
      expect(await q1("select purpose from english.ai_runs where id = $1", [old.reservation_id])).toEqual([{ purpose: "studio_extract" }]);
      await fail(svc("select english.eng_ai_gate($1, 0, false, null, null, null, 'chat') as r", [NG()]), "22023", /\(bad_purpose\)/);
    });
    it("listening question-type tags exist for both tracks with a listening group, are placed in the map, and only they may carry a seed group", async () => {
      expect(await q1("select track_id, count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng nghe' group by track_id order by track_id")).toEqual([
        { track_id: "A", n: 5 }, { track_id: "B", n: 8 },
      ]);
      expect(await q1("select count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng nghe' and group_key not like 'li-%'")).toEqual([{ n: 0 }]);
      const map = await svc<{ domains: { key: string; groups: { key: string; leaves: { ref_key: string; custom: boolean }[] }[] }[]; unassigned: { ref_key: string }[] }>(
        "select english.eng_skill_map($1) as r", [NG()]);
      const gist = map.domains.find((d) => d.key === "listening")!.groups.find((g) => g.key === "li-gist-detail")!;
      expect(gist.leaves.filter((l) => l.ref_key.startsWith("nghe-")).map((l) => [l.ref_key, l.custom])).toEqual([["nghe-details", false], ["nghe-main-idea", false]]);
      expect(map.unassigned.some((l) => l.ref_key.startsWith("nghe-"))).toBe(false);
      await fail(q1("update english.error_tags set group_key = 'vo-word-form' where track_id = 'B' and key = 'dang-tu'"), "23514");
    });
  });


});
