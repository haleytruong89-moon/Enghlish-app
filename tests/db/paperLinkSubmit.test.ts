import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayVn } from "../../lib/inquiries/dates";
import { asCommit, createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

type FileJson = { id: string; mime: string; bytes: number };
const jpg = (): FileJson => ({ id: randomUUID(), mime: "image/jpeg", bytes: 300_000 });
const pdfFile = (): FileJson => ({ id: randomUUID(), mime: "application/pdf", bytes: 120_000 });
type Svc = { id: string; replayed: boolean };

/** W4c1 · paper (≤ 12 pages) + link submission + feedback on a submission (migration 0033). One database. */
describe("paper / link submission and feedback on a submission (migration 0033)", () => {
  let db: TestDb;
  let s: Seeded;
  let family2: string;
  let learner2: string;
  let parent2Member: string;
  let parent2User: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(userId: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", userId, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  const makeLink = (title = "Unless, even if", learner = NG(), by = M().tutorNguyen) =>
    svc<Svc>("select english.eng_create_assignment($1, 'link', $2, $3, '{}'::text[], null, null, null, $4, $5) as r", [learner, "https://www.test-english.com/x", title, by, randomUUID()]);
  const makePdf = (title = "Đề giấy", learner = NG(), by = M().tutorNguyen) =>
    svc<Svc>("select english.eng_create_assignment($1, 'pdf', null, $2, '{}'::text[], null, null, $3::jsonb, $4, $5) as r", [learner, title, JSON.stringify({ main: pdfFile() }), by, randomUUID()]);
  type SubOpts = { by?: string; clientId?: string; attempt?: string; hint?: boolean | null; link?: string | null; files?: FileJson[] };
  const submit2 = (assignment: string, o: SubOpts = {}) =>
    svc<Svc>("select english.eng_submit_practice_v2($1, $2, $3, $4, $5, $6, $7::jsonb) as r", [
      assignment, o.by ?? M().studentNguyen, o.clientId ?? randomUUID(), o.attempt ?? "first", o.hint === undefined ? false : o.hint, o.link ?? null, JSON.stringify(o.files ?? [jpg()]),
    ]);
  const pages = (n: number) => Array.from({ length: n }, jpg);
  type Overview = { id: string; submission: { id: string; used_hint: boolean | null; by_role: string; files: FileJson[] } | null }[];
  const overview = (assignment: string) => svc<Overview>("select english.eng_assignment_overview($1, $2) as r", [NG(), assignment]);

  type Fb = { id: string; replayed: boolean };
  type FbOpts = { by?: string; praise?: string | null; items?: unknown; supersedes?: string | null; clientId?: string };
  const feedback = (submission: string, o: FbOpts = {}) =>
    svc<Fb>("select english.eng_write_submission_feedback($1, $2, $3::jsonb, $4, $5, $6) as r", [
      submission, o.praise === undefined ? "Bạn trình bày rõ ràng." : o.praise, JSON.stringify(o.items ?? [{ text: "Xem lại câu 38 đến 40." }]), o.supersedes ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  const record = (assignment: string) =>
    svc<{ id: string }>("select english.eng_record_result($1, 'quick', null, 'Linked', 10, 8, '{4,7}'::int[], '[]'::jsonb, 'home', 'first', false, $2::date, $3, null, $4, $5, null) as r", [
      NG(), todayVn(), assignment, M().tutorNguyen, randomUUID(),
    ]);
  const seen = async (user: string) =>
    (await asUser<{ items: Record<string, unknown>[] }>(user, "select english.eng_my_seen(null, null, 50) as r")).items;
  const history = async (user: string) =>
    asUser<{ items: Record<string, unknown>[]; waiting: number }>(user, "select english.eng_my_history(null, null, 50) as r");
  const mine = async (user: string) => asUser<Record<string, unknown>[]>(user, "select english.eng_my_practice() as r");

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    parent2User = await createAuthUser(db.client, "parent2@test.local");
    family2 = ((await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0] as { id: string }).id;
    parent2Member = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, family2]))[0] as { id: string }).id;
    learner2 = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Other child', 'B', true, 'active') returning id", [family2]))[0] as { id: string }).id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [parent2Member, learner2]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("the file limit and eng_submit_practice_v2", () => {
    it("the old 'at most 6 files' constraint is gone, a 'at most 12' one is there, and applying the migration twice changes nothing", async () => {
      const defs = async () => (await q1<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'english.submissions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%file_ids%'")).map((r) => r.d);
      const before = await defs();
      expect(before.some((d) => /<= 6\b/.test(d))).toBe(false);
      expect(before.filter((d) => /<= 12\b/.test(d))).toHaveLength(1);
      const { readFile } = await import("node:fs/promises");
      const { MIGRATIONS_DIR } = await import("../../scripts/lib/migrate");
      const file = (await import("node:fs")).readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_paper_link_submit.sql"))!;
      const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
      await db.client.query(sql);
      await db.client.query(sql);
      expect(await defs()).toEqual(before);
      expect(await count("select count(*)::int as n from english.schema_migrations where version = $1", [file.slice(0, 4)])).toBe(1);
    });

    it("a submission already stored with up to 6 files is still valid, and the old v1 function still works and still refuses 7", async () => {
      const a = await makeLink("v1 still works");
      const r = await svc<Svc>("select english.eng_submit_practice($1, $2, $3, 'first', false, null, $4::jsonb) as r", [a.id, M().studentNguyen, randomUUID(), JSON.stringify(pages(6))]);
      expect(r.replayed).toBe(false);
      await fail(svc("select english.eng_submit_practice($1, $2, $3, 'first', false, null, $4::jsonb) as r", [a.id, M().studentNguyen, randomUUID(), JSON.stringify(pages(7))]), "22023", /at most 6/);
    });

    it("v2 takes the hint answer for a PDF too, and keeps 'first' / 'retry'", async () => {
      const a = await makePdf("PDF with the hint question");
      const r = await submit2(a.id, { hint: true, attempt: "retry", files: pages(3) });
      expect(r.replayed).toBe(false);
      const ov = (await overview(a.id))[0]!;
      expect(ov.submission).toMatchObject({ id: r.id, used_hint: true, by_role: "student" });
      expect(ov.submission?.files).toHaveLength(3);
    });

    it("a student must answer the hint question, for a link and for a PDF; an adult may leave it empty", async () => {
      const link = await makeLink("hint required (link)");
      const pdf = await makePdf("hint required (pdf)");
      await fail(submit2(link.id, { hint: null }), "22004", /hint_required/);
      await fail(submit2(pdf.id, { hint: null }), "22004", /hint_required/);
      expect((await submit2(link.id, { by: M().tutorNguyen, hint: null })).replayed).toBe(false);
      expect((await submit2(pdf.id, { by: M().parent, hint: null })).replayed).toBe(false);
      const ov = (await overview(pdf.id))[0]!;
      expect(ov.submission).toMatchObject({ used_hint: null, by_role: "parent" });
    });

    it("12 pages are accepted; 13 are refused and nothing is written", async () => {
      const a = await makePdf("twelve pages");
      expect((await submit2(a.id, { files: pages(12) })).replayed).toBe(false);
      const b = await makePdf("thirteen pages");
      await fail(submit2(b.id, { files: pages(13) }), "22023", /at most 12/);
      expect(await count("select count(*)::int as n from english.submissions where assignment_id = $1", [b.id])).toBe(0);
      expect(await count("select count(*)::int as n from english.files where learner_id = $1 and created_at > now() - interval '1 minute' and id in (select unnest(file_ids) from english.submissions where assignment_id = $2)", [NG(), b.id])).toBe(0);
    });

    it("the order of the files is the order of the pages: stored in that order, shown in that order, and a replay with another order is another submission", async () => {
      const a = await makePdf("order matters");
      const sent = pages(5).reverse();
      sent.sort((x, y) => (x.id < y.id ? 1 : -1)); // any order that is not ascending by id
      const clientId = randomUUID();
      const r1 = await submit2(a.id, { clientId, files: sent });
      const stored = await q1<{ file_ids: string[] }>("select file_ids::text[] as file_ids from english.submissions where id = $1", [r1.id]);
      expect(stored[0]!.file_ids).toEqual(sent.map((f) => f.id));
      expect((await overview(a.id))[0]!.submission!.files.map((f) => f.id)).toEqual(sent.map((f) => f.id));
      // the same pages in the same order replay
      expect(await submit2(a.id, { clientId, files: sent })).toEqual({ id: r1.id, replayed: true });
      // the same pages in another order are not the same work
      await fail(submit2(a.id, { clientId, files: [...sent].reverse() }), "23505", /different submission/);
      // a different hint answer with the same client id is not the same work either
      await fail(submit2(a.id, { clientId, files: sent, hint: true }), "23505");
    });

    it("the other child's student gets 'not found'; a retracted assignment too", async () => {
      const a = await makePdf("An's", AN(), M().tutorAn);
      await fail(submit2(a.id, { by: M().studentNguyen }), "P0002");
      const b = await makeLink("will be retracted");
      await svc("select english.eng_retract_assignment($1, null, $2) as r", [b.id, M().tutorNguyen]);
      await fail(submit2(b.id), "P0002");
      await fail(submit2(randomUUID()), "P0002");
    });

    it("after a result is recorded the student can no longer send (already_reviewed); the adult still can", async () => {
      const a = await makeLink("closed by result");
      await submit2(a.id);
      await record(a.id);
      await fail(submit2(a.id), "23505", /already_reviewed/);
      expect((await submit2(a.id, { by: M().tutorNguyen })).replayed).toBe(false);
    });

    it("needs a page or a link; the function is not callable by a student or anon", async () => {
      const a = await makePdf("empty");
      await fail(submit2(a.id, { files: [] }), "23514");
      const args = [a.id, M().studentNguyen, randomUUID(), JSON.stringify([jpg()])];
      for (const role of ["authenticated", "anon"] as const) {
        const err = await errorAs(db.client, role, s.users.studentNguyen, "select english.eng_submit_practice_v2($1, $2, $3, 'first', false, null, $4::jsonb)", args);
        expect(err?.code, role).toBe("42501");
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("feedback on a submission", () => {
    let a: Svc;
    let sub: Svc;
    beforeAll(async () => {
      a = await makePdf("Feedback target");
      sub = await submit2(a.id, { files: pages(3) });
    });

    it("the child's tutor writes: a praise and up to 3 things to fix, renumbered 1..k", async () => {
      const w = await feedback(sub.id, { praise: "  Chữ viết rõ.  ", items: [{ text: " Câu 38 ", n: 9 }, { text: "Câu 39" }] });
      expect(w.replayed).toBe(false);
      const row = (await q1<{ praise: string; items: { n: number; text: string }[]; author_role: string; assignment_id: string }>("select praise, items, author_role, assignment_id from english.submission_feedback where id = $1", [w.id]))[0]!;
      expect(row).toMatchObject({ praise: "Chữ viết rõ.", author_role: "tutor", assignment_id: a.id });
      expect(row.items).toEqual([{ n: 1, text: "Câu 38" }, { n: 2, text: "Câu 39" }]);
    });

    it("the same client id with the same content replays; with other content it is refused", async () => {
      const b = await makePdf("replay fb");
      const sb = await submit2(b.id);
      const clientId = randomUUID();
      const w = await feedback(sb.id, { clientId });
      expect(await feedback(sb.id, { clientId })).toEqual({ id: w.id, replayed: true });
      await fail(feedback(sb.id, { clientId, praise: "Khác." }), "23505", /client_id_reused/);
      await fail(feedback(sb.id, { clientId, by: M().parent }), "23505");
      expect(await count("select count(*)::int as n from english.submission_feedback where submission_id = $1", [sb.id])).toBe(1);
    });

    it("a parent of the family may write too (role recorded)", async () => {
      const b = await makeLink("parent writes");
      const sb = await submit2(b.id);
      const w = await feedback(sb.id, { by: M().parent });
      expect((await q1<{ author_role: string }>("select author_role from english.submission_feedback where id = $1", [w.id]))[0]!.author_role).toBe("parent");
    });

    it("only an adult of THIS child: the other tutor, another family's parent and a student get 42501", async () => {
      const b = await makeLink("who may");
      const sb = await submit2(b.id);
      await fail(feedback(sb.id, { by: M().tutorAn }), "42501");
      await fail(feedback(sb.id, { by: parent2Member }), "42501");
      await fail(feedback(sb.id, { by: M().studentNguyen }), "42501");
      await fail(feedback(sb.id, { by: randomUUID() }), "42501");
      await fail(feedback(randomUUID()), "P0002");
      expect(await count("select count(*)::int as n from english.submission_feedback where submission_id = $1", [sb.id])).toBe(0);
    });

    it("something is needed, shapes are checked, and anything that looks like a score is refused (praise and every item)", async () => {
      const b = await makeLink("shapes");
      const sb = await submit2(b.id);
      await fail(feedback(sb.id, { praise: null, items: [] }), "23514", /empty_feedback/);
      await fail(feedback(sb.id, { praise: "   ", items: [] }), "23514", /empty_feedback/);
      await fail(feedback(sb.id, { items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] }), "22023", /bad_items/);
      await fail(feedback(sb.id, { items: [{ text: "   " }] }), "22023", /bad_items/);
      await fail(feedback(sb.id, { items: [{ text: "x".repeat(301) }] }), "22023", /bad_items/);
      await fail(feedback(sb.id, { items: [{ nope: 1 }] }), "22023", /bad_items/);
      await fail(feedback(sb.id, { items: "text" }), "22023", /bad_items/);
      await fail(feedback(sb.id, { praise: "x".repeat(401) }), "22023", /bad_praise/);
      for (const bad of ["Được 8 điểm.", "Làm đúng 3/4 câu.", "80% đúng", "Đạt yêu cầu", "8 trên 10"]) {
        await fail(feedback(sb.id, { praise: bad }), "23514", /score_words/);
        await fail(feedback(sb.id, { praise: "Tốt.", items: [{ text: bad }] }), "23514", /score_words/);
      }
      // dates and ordinary words pass
      expect((await feedback(sb.id, { praise: "Bài nộp ngày 5/10 rất gọn.", items: [{ text: "Xem lại điểm mạnh của đoạn 2." }] })).replayed).toBe(false);
      // a praise of 400 characters and items of 300 are fine
      const c = await makeLink("limits");
      const sc = await submit2(c.id);
      expect((await feedback(sc.id, { praise: "x".repeat(400), items: [{ text: "y".repeat(300) }] })).replayed).toBe(false);
    });

    it("the table itself also refuses score words and an empty note", async () => {
      const b = await makeLink("table checks");
      const sb = await submit2(b.id);
      const ins = (praise: string | null, items: string) =>
        q1("insert into english.submission_feedback(learner_id, submission_id, assignment_id, praise, items, author_member, author_role, client_id) values ($1,$2,$3,$4,$5::jsonb,$6,'tutor',$7)", [NG(), sb.id, b.id, praise, items, M().tutorNguyen, randomUUID()]);
      await fail(ins("Được 8 điểm", "[]"), "23514");
      await fail(ins("Tốt", '[{"n":1,"text":"6/10"}]'), "23514");
      await fail(ins(null, "[]"), "23514");
      await fail(ins("Tốt", '[{"n":1,"text":"a"},{"n":2,"text":"b"},{"n":3,"text":"c"},{"n":4,"text":"d"}]'), "23514");
    });

    it("edit: a new row, one level, only the author; a second edit of the same row and a second 'first' are refused", async () => {
      const b = await makeLink("edit");
      const sb = await submit2(b.id);
      const w1 = await feedback(sb.id, { by: M().tutorNguyen });
      await fail(feedback(sb.id, { by: M().tutorNguyen }), "23505", /already_given/);
      await fail(feedback(sb.id, { by: M().parent, supersedes: w1.id }), "42501", /author_only/);
      await fail(feedback(sb.id, { supersedes: randomUUID() }), "P0002");
      const w2 = await feedback(sb.id, { supersedes: w1.id, praise: "Bản sửa." });
      await fail(feedback(sb.id, { supersedes: w1.id, praise: "Lần nữa." }), "23505", /already_superseded/);
      const w3 = await feedback(sb.id, { supersedes: w2.id, praise: "Bản sửa 2." });
      expect(await count("select count(*)::int as n from english.submission_feedback where submission_id = $1", [sb.id])).toBe(3);
      const list = await svc<{ id: string; live: boolean; praise: string; author_name: string }[]>("select english.eng_submission_feedback($1, $2) as r", [NG(), b.id]);
      expect(list.map((x) => [x.id, x.live])).toEqual([[w3.id, true], [w2.id, false], [w1.id, false]]);
      expect(list[0]!.author_name).toBeTruthy();
    });

    it("only the CURRENT submission can be commented; a retracted assignment cannot", async () => {
      const b = await makeLink("replaced");
      const first = await submit2(b.id);
      const second = await submit2(b.id, { attempt: "retry" });
      await fail(feedback(first.id), "23505", /submission_replaced/);
      expect((await feedback(second.id)).replayed).toBe(false);
      const c = await makeLink("retracted");
      const sc = await submit2(c.id);
      await svc("select english.eng_retract_assignment($1, null, $2) as r", [c.id, M().tutorNguyen]);
      await fail(feedback(sc.id), "P0002");
    });

    it("append-only (update / delete / truncate refused), RLS: the child's adults read, the other tutor / other family / students read nothing, anon has no access", async () => {
      const row = (await q1<{ id: string }>("select id from english.submission_feedback where learner_id = $1 limit 1", [NG()]))[0]!;
      await fail(q1("update english.submission_feedback set praise = 'x' where id = $1", [row.id]), "42501");
      await fail(q1("delete from english.submission_feedback where id = $1", [row.id]), "42501");
      await fail(q1("truncate english.submission_feedback"), "42501");
      await fail(svc("insert into english.submission_feedback(learner_id, submission_id, assignment_id, praise, author_member, author_role, client_id) values ($1,$2,$3,'x',$4,'tutor','abcdefgh1') returning 1 as r", [NG(), sub.id, a.id, M().tutorNguyen]), "42501");
      const cnt = async (uid: string) => (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.submission_feedback where learner_id = $1", [NG()]))[0]!.n;
      expect(await cnt(s.users.tutorNguyen)).toBeGreaterThan(0);
      expect(await cnt(s.users.parent)).toBeGreaterThan(0);
      expect([await cnt(s.users.tutorAn), await cnt(s.users.studentNguyen), await cnt(s.users.studentAn), await cnt(parent2User)]).toEqual([0, 0, 0, 0]);
      expect((await errorAs(db.client, "anon", null, "select 1 from english.submission_feedback"))?.code).toBe("42501");
    });

    it("the writers and the adult read are for the server only (service_role): no client role can call them", async () => {
      for (const role of ["authenticated", "anon"] as const) {
        const w = await errorAs(db.client, role, s.users.tutorNguyen, "select english.eng_write_submission_feedback($1, 'x', '[]'::jsonb, null, $2, $3)", [sub.id, M().tutorNguyen, randomUUID()]);
        expect(w?.code, role).toBe("42501");
        const r = await errorAs(db.client, role, s.users.tutorNguyen, "select english.eng_submission_feedback($1, $2)", [NG(), a.id]);
        expect(r?.code, role).toBe("42501");
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("what the child sees (eng_my_seen, eng_my_history, eng_my_practice)", () => {
    it("feedback counts as 'seen': the work moves from 'waiting' to 'seen' with the praise and the things to fix - no score, no author, no ids of the note", async () => {
      const a = await makePdf("Seen by feedback");
      const sub = await submit2(a.id, { files: pages(2) });
      let h = await history(s.users.studentNguyen);
      const before = h.items.find((r) => r.ref === sub.id)!;
      expect(before.seen).toBe(false);
      expect((await seen(s.users.studentNguyen)).some((r) => r.ref === sub.id)).toBe(false);
      expect(((await mine(s.users.studentNguyen)).find((x) => x.assignment_id === a.id) as { reviewed: boolean }).reviewed).toBe(false);

      const w = await feedback(sub.id, { praise: "Bạn viết gọn.", items: [{ text: "Câu 38–40: xem lại cách chia." }, { text: "Câu 12 thiếu đơn vị." }] });
      h = await history(s.users.studentNguyen);
      expect(h.items.find((r) => r.ref === sub.id)!.seen).toBe(true);
      const row = (await seen(s.users.studentNguyen)).find((r) => r.ref === sub.id)!;
      expect(row).toMatchObject({ src: "submission", kind: "paper", title: "Seen by feedback", praise: "Bạn viết gọn.", fb_state: "note", assignment_id: a.id });
      expect(row.notes).toEqual([{ n: 1, text: "Câu 38–40: xem lại cách chia.", excerpt: null }, { n: 2, text: "Câu 12 thiếu đơn vị.", excerpt: null }]);
      expect(row.revision_activity_id).toBeNull();
      const flat = JSON.stringify(row);
      expect(flat).not.toContain(w.id);
      expect(flat).not.toMatch(/author|member|score|correct|wrong|result|tag/i);
      expect(((await mine(s.users.studentNguyen)).find((x) => x.assignment_id === a.id) as { reviewed: boolean }).reviewed).toBe(true);
      // the student cannot send again
      await fail(submit2(a.id), "23505", /already_reviewed/);
    });

    it("an edit shows only the latest version; praise alone and items alone both show", async () => {
      const a = await makeLink("edited");
      const sub = await submit2(a.id);
      const w1 = await feedback(sub.id, { praise: "Cũ.", items: [{ text: "Cũ 1" }] });
      await feedback(sub.id, { supersedes: w1.id, praise: null, items: [{ text: "Mới 1" }] });
      const row = (await seen(s.users.studentNguyen)).find((r) => r.ref === sub.id)!;
      expect(row.praise).toBeNull();
      expect(row.notes).toEqual([{ n: 1, text: "Mới 1", excerpt: null }]);
      const b = await makeLink("praise only");
      const sb = await submit2(b.id);
      await feedback(sb.id, { praise: "Chỉ khen.", items: [] });
      const rb = (await seen(s.users.studentNguyen)).find((r) => r.ref === sb.id)!;
      expect(rb.praise).toBe("Chỉ khen.");
      expect(rb.notes ?? []).toEqual([]);
      expect(rb.fb_state).toBe("note");
    });

    it("the other child sees nothing of it, and a submission without feedback or result is not in 'seen'", async () => {
      const a = await makeLink("private to Nguyên");
      const sub = await submit2(a.id);
      await feedback(sub.id);
      expect((await seen(s.users.studentAn)).some((r) => r.ref === sub.id)).toBe(false);
      expect((await history(s.users.studentAn)).items.some((r) => r.ref === sub.id)).toBe(false);
      const c = await makeLink("no feedback");
      const sc = await submit2(c.id);
      expect((await seen(s.users.studentNguyen)).some((r) => r.ref === sc.id)).toBe(false);
    });

    it("feedback written on a submission does not mark a NEWER submission by the adult as seen", async () => {
      const a = await makeLink("adult resubmits");
      const first = await submit2(a.id);
      await feedback(first.id);
      const second = await submit2(a.id, { by: M().tutorNguyen, attempt: "retry" });
      const h = (await history(s.users.studentNguyen)).items;
      expect(h.some((r) => r.ref === first.id)).toBe(false); // replaced
      expect(h.find((r) => r.ref === second.id)!.seen).toBe(false);
    });

    it("a result recorded after the submission still counts as seen, as before", async () => {
      const a = await makeLink("result still counts");
      const sub = await submit2(a.id);
      await record(a.id);
      expect((await history(s.users.studentNguyen)).items.find((r) => r.ref === sub.id)!.seen).toBe(true);
      expect((await seen(s.users.studentNguyen)).find((r) => r.ref === sub.id)).toMatchObject({ src: "submission", praise: null });
    });

    it("the three child reads are still granted to authenticated only", async () => {
      for (const fn of ["eng_my_seen(null, null, 5)", "eng_my_practice()"]) {
        for (const role of ["anon"] as const) expect((await errorAs(db.client, role, null, `select english.${fn}`))?.code, `${fn} ${role}`).toBe("42501");
        expect((await errorAs(db.client, "service_role", null, `select english.${fn}`))?.code, `${fn} service_role`).toBe("42501");
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe("purge", () => {
    it("the dry run and the receipt count submission_feedback with the same keys; afterwards there are no rows", async () => {
      const L = NG();
      const before = await count("select count(*)::int as n from english.submission_feedback where learner_id = $1", [L]);
      expect(before).toBeGreaterThan(0);
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts).toMatchObject({ submission_feedback: before });
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toMatchObject({ submission_feedback: before });
      expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
      expect(await count("select count(*)::int as n from english.submission_feedback where learner_id = $1", [L])).toBe(0);
      expect(await count("select count(*)::int as n from english.submissions where learner_id = $1", [L])).toBe(0);
      // the other child is untouched
      expect(await count("select count(*)::int as n from english.assignments where learner_id = $1", [AN()])).toBeGreaterThan(0);
    });
  });
});
