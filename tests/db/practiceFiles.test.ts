import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectLinkSource } from "../../lib/practice/link";
import { buildPath } from "../../lib/storage/rules";
import { addDays, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();

type Svc = { id: string; replayed: boolean };
type FileJson = { id: string; mime: string; bytes: number };
const pdf = (over: Partial<FileJson> = {}): FileJson => ({ id: randomUUID(), mime: "application/pdf", bytes: 120_000, ...over });
const png = (over: Partial<FileJson> = {}): FileJson => ({ id: randomUUID(), mime: "image/png", bytes: 80_000, ...over });

describe("S5b-1 PR B: practice assignments, submissions, files (migration 0016)", () => {
  let db: TestDb;
  let s: Seeded;
  let family2: string;
  let learner2: string;
  let parent2Member: string;
  let student2User: string;
  let student2Member: string;
  const M = () => s.members;
  const AN = () => s.learners.an;
  const NG = () => s.learners.nguyen;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const asUser = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", userId, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);

  type MakeOpts = { learner?: string; by?: string; title?: string; tags?: string[]; due?: string | null; frame?: string | null; clientId?: string };
  const makeLink = (url: string, o: MakeOpts = {}) =>
    svc<Svc>("select english.eng_create_assignment($1, 'link', $2, $3, $4::text[], $5::date, $6, null, $7, $8) as r", [
      o.learner ?? NG(), url, o.title ?? "Unless, even if", o.tags ?? [], o.due === undefined ? null : o.due, o.frame ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  const makePdf = (files: { main: FileJson; answer?: FileJson | null }, o: MakeOpts = {}) =>
    svc<Svc>("select english.eng_create_assignment($1, 'pdf', null, $2, $3::text[], $4::date, $5, $6::jsonb, $7, $8) as r", [
      o.learner ?? NG(), o.title ?? "KET Reading", o.tags ?? [], o.due === undefined ? null : o.due, o.frame ?? null, JSON.stringify(files), o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  type SubOpts = { by?: string; clientId?: string; attempt?: string; hint?: boolean; link?: string | null; files?: FileJson[] };
  const submit = (assignment: string, o: SubOpts = {}) =>
    svc<Svc>("select english.eng_submit_practice($1, $2, $3, $4, $5, $6, $7::jsonb) as r", [
      assignment, o.by ?? M().studentNguyen, o.clientId ?? randomUUID(), o.attempt ?? "first", o.hint ?? false, o.link === undefined ? null : o.link, JSON.stringify(o.files ?? [png()]),
    ]);
  type Overview = {
    id: string; kind: string; title: string; source_key: string | null; retracted_at: string | null; result_id: string | null;
    file: FileJson | null; answer_file: FileJson | null;
    submission: { id: string; attempt: string; used_hint: boolean; by_role: string; link_url: string | null; files: FileJson[] } | null;
  }[];
  const overview = (learner: string, assignment: string | null = null) => svc<Overview>("select english.eng_assignment_overview($1, $2) as r", [learner, assignment]);
  const mine = (userId: string) => asUser<Record<string, unknown>[]>(userId, "select english.eng_my_practice() as r");
  const record = (assignment: string | null, learner = NG(), by = M().tutorNguyen) =>
    svc<{ id: string }>("select english.eng_record_result($1, 'quick', null, 'Linked', 10, 8, '{4,7}'::int[], '[]'::jsonb, 'home', 'first', false, $2::date, $3, null, $4, $5, null) as r", [
      learner, TODAY, assignment, by, randomUUID(),
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const parent2User = await createAuthUser(db.client, "parent2@test.local");
    student2User = await createAuthUser(db.client, "student2@test.local");
    family2 = ((await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0] as { id: string }).id;
    parent2Member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, family2]))[0] as { id: string }).id;
    student2Member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'student', 'Other student') returning id", [student2User, family2]))[0] as { id: string }).id;
    learner2 = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status, member_id) values ($1, 'Other child', 'B', true, 'active', $2) returning id", [family2, student2Member]))[0] as { id: string }).id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [parent2Member, learner2]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("the storage bucket", () => {
    it("on plain Postgres (no storage schema) the migration still applies and creates nothing in storage", async () => {
      expect(await count("select count(*)::int as n from pg_namespace where nspname = 'storage'")).toBe(0);
      expect(await count("select count(*)::int as n from english.schema_migrations where version = '0016'")).toBe(1);
    });

    it("with a storage schema: creates ONE private bucket english-work (15 MB, pdf/png/jpeg/webp), is repeatable, corrects a changed bucket, touches no other bucket and adds no policy", async () => {
      const own = await createTestDb();
      try {
        await own.client.query(`
          create schema storage;
          create table storage.buckets (id text primary key, name text not null unique, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
          create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
          alter table storage.objects enable row level security;
          insert into storage.buckets(id, name, public) values ('launcher-files', 'launcher-files', true);
          insert into storage.buckets(id, name, public, file_size_limit) values ('english-work', 'english-work', true, 1);`);
        await migrate(own.client);
        const want = { id: "english-work", public: false, file_size_limit: "15728640", allowed_mime_types: ["application/pdf", "image/png", "image/jpeg", "image/webp"] };
        const rows = (await own.client.query("select id, public, file_size_limit::text as file_size_limit, allowed_mime_types from storage.buckets order by id")).rows;
        expect(rows).toEqual([want, { id: "launcher-files", public: true, file_size_limit: null, allowed_mime_types: null }]);
        await migrate(own.client, true);
        expect((await own.client.query("select count(*)::int as n from storage.buckets")).rows[0].n).toBe(2);
        expect((await own.client.query("select count(*)::int as n from pg_policies where schemaname = 'storage'")).rows[0].n).toBe(0);
        // the Launcher's own bucket was left alone
        expect(rows[1]).toMatchObject({ id: "launcher-files", public: true });
      } finally {
        await own.drop();
      }
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("links: https only, source recognised from the host (database and app agree)", () => {
    const table: [string, "test-english" | "notebooklm" | "gemini" | "other" | null][] = [
      ["https://test-english.com/grammar/b2/unless/", "test-english"],
      ["https://www.test-english.com/x", "test-english"],
      ["https://TEST-ENGLISH.COM", "test-english"],
      ["https://notebooklm.google.com/notebook/abc", "notebooklm"],
      ["https://notebook.google.com/notebook/abc", "notebooklm"],
      ["https://gemini.google.com/share/abc123", "gemini"],
      ["https://share.gemini.google/abc", "gemini"],
      ["https://example.org/quiz?id=1", "other"],
      ["https://evil-test-english.com/x", "other"],
      ["https://test-english.com.evil.org/x", "other"],
      ["https://google.com/gemini.google.com", "other"],
      ["http://test-english.com/x", null],
      ["javascript:alert(1)", null],
      ["https://user:pw@test-english.com/x", null],
      ["https://test-english.com@evil.org/x", null],
      ["https://exa mple.org", null],
      ["ftp://example.org", null],
    ];
    it("the database function and lib/practice/link.ts give the same source for every address", async () => {
      for (const [url, want] of table) {
        const dbKey = (await q1<{ k: string | null }>("select english.eng_link_source_key($1) as k", [url]))[0]?.k ?? null;
        expect(dbKey, url).toBe(want);
        expect(detectLinkSource(url), url).toBe(want);
      }
    });

    it("an assignment stores the detected source; a non-https or odd address is refused", async () => {
      const a = await makeLink("https://notebooklm.google.com/notebook/abc", { title: "Tiếng Anh Trắc nghiệm" });
      const row = (await q1<{ source_key: string; kind: string }>("select source_key, kind from english.assignments where id = $1", [a.id]))[0];
      expect(row).toEqual({ source_key: "notebooklm", kind: "link" });
      for (const bad of ["http://test-english.com/x", "javascript:alert(1)", "https://user:pw@example.org/", "https://exa mple.org", "", "https://" + "a".repeat(2000)]) {
        await fail(makeLink(bad), "22023", /valid https/);
      }
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("giving work (link and PDF)", () => {
    it("a tutor gives a link; a PDF with an answer key creates two file rows with the exact path shape and sizes", async () => {
      const main = pdf();
      const key = pdf({ bytes: 5000 });
      const a = await makePdf({ main, answer: key }, { title: "KET Reading — Part 1–3", tags: ["cau-dieu-kien-dao-ngu"], due: addDays(TODAY, 5) });
      expect(a.replayed).toBe(false);
      const files = await q1<{ id: string; kind: string; path: string; bytes: number; mime: string; learner_id: string; family_id: string }>(
        "select id, kind, path, bytes, mime, learner_id, family_id from english.files order by kind");
      const f = files.filter((x) => x.id === main.id || x.id === key.id);
      expect(f.map((x) => x.kind).sort()).toEqual(["answer_key", "assignment_pdf"]);
      for (const x of f) {
        expect(x.learner_id).toBe(NG());
        expect(x.path).toBe(buildPath({ familyId: s.familyId, learnerId: NG(), fileId: x.id, mime: "application/pdf" }));
        expect(x.path).toMatch(new RegExp(`^${s.familyId}/${NG()}/${x.id}\\.pdf$`));
      }
      const ov = (await overview(NG(), a.id))[0];
      expect(ov).toMatchObject({ kind: "pdf", title: "KET Reading — Part 1–3", file: { id: main.id, bytes: 120_000 }, answer_file: { id: key.id }, submission: null, result_id: null, retracted_at: null });
    });

    it("the parent can give work too; replaying the same client_id returns the same assignment, a different one is a conflict", async () => {
      const clientId = randomUUID();
      const a = await makeLink("https://gemini.google.com/share/xyz", { by: M().parent, learner: AN(), tags: ["hien-tai-don"], clientId });
      const again = await makeLink("https://gemini.google.com/share/xyz", { by: M().parent, learner: AN(), tags: ["hien-tai-don"], clientId });
      expect(again).toEqual({ id: a.id, replayed: true });
      await fail(makeLink("https://gemini.google.com/share/other", { by: M().parent, learner: AN(), tags: ["hien-tai-don"], clientId }), "23505");
    });

    it("refuses: a student, a tutor of the other child, a parent of another family; unknown learner", async () => {
      await fail(makeLink("https://example.org/a", { by: M().studentNguyen }), "42501");
      await fail(makeLink("https://example.org/a", { by: M().tutorAn }), "42501"); // An's tutor, Nguyên's child
      await fail(makeLink("https://example.org/a", { by: parent2Member }), "42501");
      await fail(makeLink("https://example.org/a", { learner: randomUUID() }), "P0002");
    });

    it("validates title, tags (exist for the track, at most 3), due date, frame and file rules", async () => {
      await fail(makeLink("https://example.org/a", { title: "   " }), "22023");
      await fail(makeLink("https://example.org/a", { tags: ["khong-co-nhan"] }), "23514", /tag does not exist/);
      await fail(makeLink("https://example.org/a", { tags: ["hien-tai-don"] }), "23514", /tag does not exist/); // a Track A tag on Nguyên (B)
      await fail(makeLink("https://example.org/a", { tags: ["cau-dieu-kien-dao-ngu", "wish-would-rather", "dang-tu", "cum-dong-tu"] }), "23514", /at most 3/);
      await fail(makeLink("https://example.org/a", { due: addDays(TODAY, -1) }), "23514", /due date/);
      await fail(makeLink("https://example.org/a", { due: addDays(TODAY, 400) }), "23514", /due date/);
      const ok = await makeLink("https://example.org/a", { due: TODAY, tags: ["dang-tu", "dang-tu"] });
      expect((await q1<{ tag_keys: string[] }>("select tag_keys from english.assignments where id = $1", [ok.id]))[0]?.tag_keys).toEqual(["dang-tu"]);
      await fail(makeLink("https://example.org/a", { frame: randomUUID() }), "23514", /frame is not available/);
      await fail(makePdf({ main: png() }), "22023", /must be a PDF/);
      await fail(makePdf({ main: pdf({ mime: "text/html" }) }), "22023", /only pdf, png, jpeg and webp/);
      await fail(makePdf({ main: pdf({ bytes: 15 * 1024 * 1024 + 1 }) }), "22023", /15 MB/);
      await fail(makePdf({ main: pdf({ bytes: 0 }) }), "22023", /15 MB/);
      await fail(makePdf({ main: pdf({ id: "not-a-uuid" }) }), "22023");
      await fail(svc("select english.eng_create_assignment($1, 'pdf', null, 'x', '{}', null, null, null, $2, $3) as r", [NG(), M().tutorNguyen, randomUUID()]), "22023");
      await fail(svc("select english.eng_create_assignment($1, 'link', 'https://example.org/a', 'x', '{}', null, null, $2::jsonb, $3, $4) as r", [NG(), JSON.stringify({ main: pdf() }), M().tutorNguyen, randomUUID()]), "22023", /no files/);
      // a file id can be registered only once
      const dup = pdf();
      await makePdf({ main: dup });
      await fail(makePdf({ main: dup }), "23505");
    });

    it("a frame of the family and track is accepted; a frame of another family is not", async () => {
      const own = (await q1<{ id: string }>(
        `insert into english.test_frames(family_id, track_id, title, total_items, parts, items)
         values ($1, 'B', 'Tiny', 1, '[{"key":"A","name":"A","from":1,"to":1}]'::jsonb, '[{"n":1,"part":"A","tag_key":"dang-tu"}]'::jsonb) returning id`, [s.familyId]))[0] as { id: string };
      const other = (await q1<{ id: string }>(
        `insert into english.test_frames(family_id, track_id, title, total_items, parts, items)
         values ($1, 'B', 'Tiny', 1, '[{"key":"A","name":"A","from":1,"to":1}]'::jsonb, '[{"n":1,"part":"A","tag_key":"dang-tu"}]'::jsonb) returning id`, [family2]))[0] as { id: string };
      const a = await makeLink("https://example.org/framed", { frame: own.id });
      expect((await overview(NG(), a.id))[0]).toMatchObject({ id: a.id });
      await fail(makeLink("https://example.org/framed2", { frame: other.id }), "23514", /frame is not available/);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("what a student can see and read", () => {
    let nLink: string;
    let nPdf: string;
    let aLink: string;
    let nPdfFile: FileJson;
    let nKeyFile: FileJson;
    beforeAll(async () => {
      nLink = (await makeLink("https://test-english.com/grammar/b2/unless/", { title: "Nguyên link", tags: ["cau-dieu-kien-dao-ngu"] })).id;
      nPdfFile = pdf();
      nKeyFile = pdf();
      nPdf = (await makePdf({ main: nPdfFile, answer: nKeyFile }, { title: "Nguyên PDF", tags: ["dang-tu"] })).id;
      aLink = (await makeLink("https://notebooklm.google.com/notebook/an", { learner: AN(), by: M().tutorAn, title: "An link", tags: ["hien-tai-don"] })).id;
    });

    it("eng_my_practice returns only the student's own assignments, with no tags, frame, result or answer key", async () => {
      const list = await mine(s.users.studentNguyen);
      const titles = list.map((x) => x.title as string);
      expect(titles).toContain("Nguyên link");
      expect(titles).toContain("Nguyên PDF");
      expect(titles).not.toContain("An link");
      for (const item of list) {
        expect(Object.keys(item).sort()).toEqual(["assigned_on", "assignment_id", "due_on", "has_file", "kind", "reviewed", "source_key", "submission", "title", "url"]);
      }
      const an = (await mine(s.users.studentAn)).map((x) => x.title);
      expect(an).toContain("An link");
      expect(an).not.toContain("Nguyên link");
      // the other family's student sees nothing of ours, and ours nothing of theirs
      await makeLink("https://example.org/other-fam", { learner: learner2, by: parent2Member, title: "Other family link" });
      expect((await mine(student2User)).map((x) => x.title)).toEqual(["Other family link"]);
      expect((await mine(s.users.studentNguyen)).map((x) => x.title)).not.toContain("Other family link");
    });

    it("staff accounts get nothing from the student functions (they are not students)", async () => {
      expect(await mine(s.users.tutorNguyen)).toEqual([]);
      expect(await mine(s.users.parent)).toEqual([]);
      expect(await asUser(s.users.tutorNguyen, "select english.eng_my_practice_file($1) as r", [nPdf])).toBeNull();
      expect(await asUser(s.users.tutorNguyen, "select english.eng_my_review_points() as r")).toBeNull();
    });

    it("the student reads NO table directly: 0 rows from files, assignments, assignment_events, submissions", async () => {
      for (const t of ["files", "assignments", "assignment_events", "submissions"]) {
        expect((await rowsAs(db.client, "authenticated", s.users.studentNguyen, `select * from english.${t}`)).length, t).toBe(0);
      }
    });

    it("staff read through RLS: the child's tutor and the family's parent see them; the other child's tutor and another family see 0", async () => {
      for (const t of ["assignments", "files"]) {
        expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, `select * from english.${t} where learner_id = $1`, [NG()])).length, t).toBeGreaterThan(0);
        expect((await rowsAs(db.client, "authenticated", s.users.parent, `select * from english.${t} where learner_id = $1`, [NG()])).length, t).toBeGreaterThan(0);
        expect((await rowsAs(db.client, "authenticated", s.users.tutorAn, `select * from english.${t} where learner_id = $1`, [NG()])).length, t).toBe(0);
      }
      // another family's parent: not one of our rows
      const parent2User = (await q1<{ user_id: string }>("select user_id from english.members where id = $1", [parent2Member]))[0]?.user_id as string;
      for (const t of ["assignments", "files", "assignment_events", "submissions"]) {
        expect((await rowsAs(db.client, "authenticated", parent2User, `select * from english.${t} where learner_id in ($1, $2)`, [NG(), AN()])).length, t).toBe(0);
      }
    });

    it("eng_my_practice_file gives the PDF path of the student's own assignment only - never the answer key, never someone else's", async () => {
      const own = await asUser<{ file_id: string; path: string; mime: string; title: string }>(s.users.studentNguyen, "select english.eng_my_practice_file($1) as r", [nPdf]);
      expect(own).toMatchObject({ file_id: nPdfFile.id, mime: "application/pdf", title: "Nguyên PDF" });
      expect(own.path).toBe(buildPath({ familyId: s.familyId, learnerId: NG(), fileId: nPdfFile.id, mime: "application/pdf" }));
      expect(JSON.stringify(own)).not.toContain(nKeyFile.id);
      expect(await asUser(s.users.studentAn, "select english.eng_my_practice_file($1) as r", [nPdf])).toBeNull(); // the other child
      expect(await asUser(student2User, "select english.eng_my_practice_file($1) as r", [nPdf])).toBeNull(); // another family
      expect(await asUser(s.users.studentNguyen, "select english.eng_my_practice_file($1) as r", [nLink])).toBeNull(); // a link has no file
      expect(await asUser(s.users.studentNguyen, "select english.eng_my_practice_file($1) as r", [aLink])).toBeNull();
    });

    it("the service-only functions are closed to students and anon; the student functions are closed to anon and service_role", async () => {
      const st = s.users.studentNguyen;
      const denied = async (role: "authenticated" | "anon", user: string | null, sql: string, params: unknown[]) => {
        const err = await errorAs(db.client, role, user, sql, params);
        expect(err?.code, sql).toBe("42501");
      };
      await denied("authenticated", st, "select english.eng_submit_practice($1, $2, 'abcdefgh1', 'first', false, null, '[]'::jsonb)", [nLink, M().studentNguyen]);
      await denied("authenticated", st, "select english.eng_create_assignment($1, 'link', 'https://example.org', 't', '{}', null, null, null, $2, 'abcdefgh1')", [NG(), M().studentNguyen]);
      await denied("authenticated", st, "select english.eng_retract_assignment($1, null, $2)", [nLink, M().studentNguyen]);
      await denied("authenticated", st, "select english.eng_assignment_overview($1, null)", [NG()]);
      await denied("authenticated", st, "select english.eng_register_file($1, $2, 'work_photo', '{}'::jsonb, $3)", [s.familyId, NG(), M().studentNguyen]);
      await denied("anon", null, "select english.eng_my_practice()", []);
      await denied("anon", null, "select english.eng_my_review_points()", []);
      await denied("anon", null, "select english.eng_my_practice_file($1)", [nPdf]);
      for (const fn of ["eng_my_practice()", "eng_my_review_points()"]) {
        const err = await errorAs(db.client, "service_role", null, `select english.${fn}`);
        expect(err?.code, fn).toBe("42501");
      }
    });

    it("a retracted assignment disappears for the student and can no longer be submitted", async () => {
      const a = await makeLink("https://example.org/retract-me", { title: "To retract" });
      expect((await mine(s.users.studentNguyen)).map((x) => x.title)).toContain("To retract");
      await fail(svc("select english.eng_retract_assignment($1, null, $2) as r", [a.id, M().tutorAn]), "42501"); // the other child's tutor
      await fail(svc("select english.eng_retract_assignment($1, null, $2) as r", [a.id, M().studentNguyen]), "42501");
      await fail(svc("select english.eng_retract_assignment($1, null, $2) as r", [a.id, parent2Member]), "42501");
      expect(await svc("select english.eng_retract_assignment($1, 'wrong sheet', $2) as r", [a.id, M().tutorNguyen])).toEqual({ id: a.id, replayed: false });
      expect(await svc("select english.eng_retract_assignment($1, null, $2) as r", [a.id, M().parent])).toEqual({ id: a.id, replayed: true });
      expect((await mine(s.users.studentNguyen)).map((x) => x.title)).not.toContain("To retract");
      await fail(submit(a.id), "P0002");
      expect((await overview(NG(), a.id))[0]?.retracted_at).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("submitting", () => {
    it("the student sends a screenshot with the two taps; files are registered with exact paths; the tutor's overview shows it", async () => {
      const a = await makeLink("https://test-english.com/grammar/b2/unless/", { title: "Submit me" });
      const shot = png();
      const r = await submit(a.id, { attempt: "first", hint: true, link: "https://test-english.com/result/abc", files: [shot] });
      expect(r.replayed).toBe(false);
      const ov = (await overview(NG(), a.id))[0];
      expect(ov?.submission).toMatchObject({ id: r.id, attempt: "first", used_hint: true, by_role: "student", link_url: "https://test-english.com/result/abc", files: [{ id: shot.id, mime: "image/png" }] });
      const file = (await q1<{ kind: string; path: string; learner_id: string }>("select kind, path, learner_id from english.files where id = $1", [shot.id]))[0];
      expect(file).toMatchObject({ kind: "result_image", learner_id: NG() });
      expect(file?.path).toBe(buildPath({ familyId: s.familyId, learnerId: NG(), fileId: shot.id, mime: "image/png" }));
      const list = (await mine(s.users.studentNguyen)).find((x) => x.assignment_id === a.id) as { submission: Record<string, unknown>; reviewed: boolean };
      expect(list.submission).toMatchObject({ attempt: "first", used_hint: true, file_count: 1, has_link: true });
      expect(Object.keys(list.submission).sort()).toEqual(["attempt", "file_count", "has_link", "submitted_at", "used_hint"]);
      expect(list.reviewed).toBe(false);
    });

    it("work on a PDF is sent as photos or files (kind work_photo); a pdf file is fine there, not on a link assignment", async () => {
      const a = await makePdf({ main: pdf() }, { title: "Paper work" });
      const photo = png();
      const filled = pdf();
      await submit(a.id, { files: [photo, filled] });
      const kinds = await q1<{ id: string; kind: string }>("select id, kind from english.files where id = any($1::uuid[])", [[photo.id, filled.id]]);
      expect(kinds.map((k) => k.kind)).toEqual(["work_photo", "work_photo"]);
      const l = await makeLink("https://example.org/img-only");
      await fail(submit(l.id, { files: [pdf()] }), "22023", /screenshot must be an image/);
      await fail(submit(a.id, { link: "https://example.org/x", files: [png()] }), "22023", /photos or files, not a link/);
    });

    it("a student cannot submit for another child's assignment, another family's, or one that does not exist", async () => {
      const nguyenLink = await makeLink("https://example.org/n-only", { title: "N only" });
      await fail(submit(nguyenLink.id, { by: M().studentAn }), "P0002");
      await fail(submit(nguyenLink.id, { by: student2Member }), "P0002");
      await fail(submit(randomUUID()), "P0002");
      const anLink = await makeLink("https://example.org/a-only", { learner: AN(), by: M().tutorAn, title: "A only" });
      await fail(submit(anLink.id), "P0002"); // Nguyên's student on An's assignment
      const otherFam = await makeLink("https://example.org/of", { learner: learner2, by: parent2Member, title: "OF" });
      await fail(submit(otherFam.id), "P0002");
      // nothing was written by any of those
      expect(await count("select count(*)::int as n from english.submissions where assignment_id = any($1::uuid[])", [[nguyenLink.id, anLink.id, otherFam.id]])).toBe(0);
    });

    it("needs something (a file or a link); at most 6 files; a file is used once; bad tap values and files are refused", async () => {
      const a = await makeLink("https://example.org/needs");
      await fail(submit(a.id, { files: [] }), "23514", /screenshot, a photo or a link/);
      await fail(submit(a.id, { files: [png(), png(), png(), png(), png(), png(), png()] }), "22023", /at most 6/);
      await fail(submit(a.id, { attempt: "third" }), "22023");
      await fail(submit(a.id, { link: "http://insecure.example", files: [] }), "22023", /https/);
      await fail(submit(a.id, { files: [png({ mime: "image/gif" })] }), "22023");
      await fail(submit(a.id, { files: [png({ bytes: 16 * 1024 * 1024 })] }), "22023");
      const twice = png();
      await fail(submit(a.id, { files: [twice, { ...twice }] }), "23505"); // same id twice: the primary key stops the second
      const used = png();
      await submit(a.id, { files: [used] });
      const b = await makeLink("https://example.org/needs2");
      await fail(submit(b.id, { files: [used] }), "23505", /only be used once/);
      // a link alone is enough
      const linkOnly = await submit(b.id, { link: "https://example.org/done", files: [] });
      expect(linkOnly.replayed).toBe(false);
    });

    it("replays the same submission, refuses the same client_id with different content", async () => {
      const a = await makeLink("https://example.org/replay");
      const f = png();
      const clientId = randomUUID();
      const r1 = await submit(a.id, { clientId, files: [f], hint: false });
      expect(await submit(a.id, { clientId, files: [f], hint: false })).toEqual({ id: r1.id, replayed: true });
      await fail(submit(a.id, { clientId, files: [f], hint: true }), "23505");
      await fail(submit(a.id, { clientId, files: [png()], hint: false }), "23505");
      expect(await count("select count(*)::int as n from english.submissions where assignment_id = $1", [a.id])).toBe(1);
    });

    it("sending again replaces the earlier one (the old row stays, the new one supersedes it)", async () => {
      const a = await makeLink("https://example.org/resend");
      const first = await submit(a.id, { attempt: "first" });
      const second = await submit(a.id, { attempt: "retry", hint: true });
      const ov = (await overview(NG(), a.id))[0];
      expect(ov?.submission).toMatchObject({ id: second.id, attempt: "retry", used_hint: true });
      const rows = await q1<{ id: string; supersedes_id: string | null }>("select id, supersedes_id from english.submissions where assignment_id = $1 order by created_at", [a.id]);
      expect(rows).toEqual([{ id: first.id, supersedes_id: null }, { id: second.id, supersedes_id: first.id }]);
      // the list for the student still shows one current submission
      const item = (await mine(s.users.studentNguyen)).find((x) => x.assignment_id === a.id) as { submission: { attempt: string } };
      expect(item.submission.attempt).toBe("retry");
    });

    it("once the tutor has recorded a result the student cannot send again; staff still can ('nộp thay')", async () => {
      const a = await makeLink("https://example.org/closed");
      await submit(a.id);
      await record(a.id);
      expect((await overview(NG(), a.id))[0]?.result_id).not.toBeNull();
      const item = (await mine(s.users.studentNguyen)).find((x) => x.assignment_id === a.id) as { reviewed: boolean; submission: unknown };
      expect(item.reviewed).toBe(true);
      await fail(submit(a.id), "23505", /already_reviewed/);
      const viaTutor = await submit(a.id, { by: M().tutorNguyen });
      expect(viaTutor.replayed).toBe(false);
    });

    it("'nộp thay': the child's tutor and the parent can submit for the student (role recorded); the other tutor and another family cannot", async () => {
      const a = await makeLink("https://example.org/for-student");
      const bytutor = await submit(a.id, { by: M().tutorNguyen });
      const byparent = await submit(a.id, { by: M().parent });
      await fail(submit(a.id, { by: M().tutorAn }), "42501");
      await fail(submit(a.id, { by: parent2Member }), "42501");
      const roles = await q1<{ id: string; submitted_by_role: string }>("select id, submitted_by_role from english.submissions where assignment_id = $1 order by created_at", [a.id]);
      expect(roles).toEqual([{ id: bytutor.id, submitted_by_role: "tutor" }, { id: byparent.id, submitted_by_role: "parent" }]);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("results linked to assignments", () => {
    it("a result can point to the same child's assignment; another child's, another family's or a made-up id is refused", async () => {
      const mineA = await makeLink("https://example.org/r1");
      const theirs = await makeLink("https://example.org/r2", { learner: AN(), by: M().tutorAn });
      const foreign = await makeLink("https://example.org/r3", { learner: learner2, by: parent2Member });
      const ok = await record(mineA.id);
      expect((await q1<{ assignment_id: string }>("select assignment_id from english.results where id = $1", [ok.id]))[0]?.assignment_id).toBe(mineA.id);
      await fail(record(theirs.id), "23514", /does not belong to this learner/);
      await fail(record(foreign.id), "23514", /does not belong to this learner/);
      await fail(record(randomUUID()), "23514", /does not belong to this learner/);
      expect((await record(null)).id).toBeTruthy(); // paper work stays possible
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("'Việc cần ôn' and the message (eng_my_review_points)", () => {
    const note = (learner: string, by: string, over: { weak?: string[]; message?: string | null; parent?: string | null; supersedes?: string | null; date?: string } = {}) =>
      svc<Svc>("select english.eng_write_lesson_note_v2($1, $2::date, 'Unit 13', $3::text[], $4, $5, '[]'::jsonb, $6, $7, $8) as r", [
        learner, over.date ?? TODAY, over.weak ?? [], over.message === undefined ? null : over.message, over.parent === undefined ? null : over.parent, over.supersedes ?? null, by, randomUUID(),
      ]);

    it("is null until a note exists", async () => {
      expect(await asUser(s.users.studentNguyen, "select english.eng_my_review_points() as r")).toBeNull();
    });

    it("returns the label names and the message of the newest note - not the note for the parent, not another child's", async () => {
      await note(NG(), M().tutorNguyen, { date: addDays(TODAY, -3), weak: ["wish-would-rather"], message: "Old message" });
      const n2 = await note(NG(), M().tutorNguyen, { weak: ["dang-tu", "cum-dong-tu"], message: "Nhớ dạng từ nhé", parent: "Secret for parent: weak on everything" });
      await note(AN(), M().tutorAn, { weak: ["hien-tai-don"], message: "An message" });
      const r = await asUser<{ session_date: string; message: string; labels: string[] }>(s.users.studentNguyen, "select english.eng_my_review_points() as r");
      expect(r.message).toBe("Nhớ dạng từ nhé");
      expect(r.labels).toHaveLength(2);
      expect(r.labels).not.toContain("dang-tu");
      expect(Object.keys(r).sort()).toEqual(["labels", "message", "session_date"]);
      expect(JSON.stringify(r)).not.toMatch(/Secret|An message|Old message/);
      // a corrected note replaces it
      await note(NG(), M().tutorNguyen, { weak: ["dang-tu"], message: "Corrected", supersedes: n2.id });
      const r2 = await asUser<{ message: string; labels: string[] }>(s.users.studentNguyen, "select english.eng_my_review_points() as r");
      expect(r2.message).toBe("Corrected");
      expect(r2.labels).toHaveLength(1);
      expect((await asUser<{ message: string }>(s.users.studentAn, "select english.eng_my_review_points() as r")).message).toBe("An message");
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("append-only", () => {
    it("files, assignments, assignment_events and submissions cannot be updated, deleted or truncated", async () => {
      const a = await makeLink("https://example.org/ao");
      await svc("select english.eng_retract_assignment($1, null, $2) as r", [a.id, M().tutorNguyen]);
      const sub = await makeLink("https://example.org/ao2");
      await submit(sub.id);
      const stmts = [
        "update english.files set bytes = 1",
        "delete from english.files",
        "update english.assignments set title = 'x'",
        "delete from english.assignments",
        "update english.assignment_events set reason = 'x'",
        "delete from english.assignment_events",
        "update english.submissions set used_hint = true",
        "delete from english.submissions",
        "truncate english.files cascade",
        "truncate english.assignments cascade",
        "truncate english.assignment_events",
        "truncate english.submissions",
      ];
      for (const sql of stmts) {
        const err = await db.client.query(sql).then(() => null, (e: { code?: string }) => e);
        expect(err?.code, sql).toBe("42501");
      }
    });

    it("nobody (including service_role) can write the tables directly", async () => {
      for (const t of ["files", "assignments", "assignment_events", "submissions"]) {
        const err = await errorAs(db.client, "service_role", null, `delete from english.${t}`);
        expect(err?.code, t).toBe("42501");
        const err2 = await errorAs(db.client, "authenticated", s.users.parent, `delete from english.${t}`);
        expect(err2?.code, t).toBe("42501");
      }
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("purge removes the child's rows (only that child's) and reports them", () => {
    it("deletes files, assignments, events, submissions of one learner, leaves everyone else's and the family's shared files", async () => {
      const victim = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Purge child 2', 'B', true, 'active') returning id", [s.familyId]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, victim]);
      const a1 = await makePdf({ main: pdf(), answer: pdf() }, { learner: victim, by: M().parent });
      const a2 = await makeLink("https://example.org/purge", { learner: victim, by: M().parent });
      await svc("select english.eng_retract_assignment($1, null, $2) as r", [a2.id, M().parent]);
      await submit(a1.id, { by: M().parent, files: [png(), png()] });
      await record(a1.id, victim, M().parent);
      // a family file that belongs to no child
      const sharedId = randomUUID();
      await q1("insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, null, 'answer_key', $3, 'application/pdf', 10, $4)", [
        sharedId, s.familyId, buildPath({ familyId: s.familyId, learnerId: null, fileId: sharedId, mime: "application/pdf" }), M().parent,
      ]);
      const others = [
        await count("select count(*)::int as n from english.files where learner_id is distinct from $1", [victim]),
        await count("select count(*)::int as n from english.assignments where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.submissions where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.assignment_events where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.results where learner_id <> $1", [victim]),
      ];
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [victim]);
      expect(receipt.deleted).toMatchObject({ files: 4, assignments: 2, assignment_events: 1, submissions: 1, results: 1 });
      for (const t of ["files", "assignments", "submissions", "assignment_events", "results"]) {
        expect(await count(`select count(*)::int as n from english.${t} where learner_id = $1`, [victim]), t).toBe(0);
      }
      expect([
        await count("select count(*)::int as n from english.files where learner_id is distinct from $1", [victim]),
        await count("select count(*)::int as n from english.assignments where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.submissions where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.assignment_events where learner_id <> $1", [victim]),
        await count("select count(*)::int as n from english.results where learner_id <> $1", [victim]),
      ]).toEqual(others);
      expect(await count("select count(*)::int as n from english.files where id = $1", [sharedId])).toBe(1);
    });
  });
});
