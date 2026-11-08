import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";
import { pgPointStore } from "../../scripts/lib/pointEnginePg";
import { pointEvidenceKeyFor, rebuildPoints, recomputePoints } from "../../lib/engine/points/runner";
import { projectPointDecisions } from "../../lib/engine/points/project";

describe("W3 points + import (migration 0027)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.client.query<R>(sql, p)).rows;
  const svc = <T = unknown>(sql: string, p: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, p)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const e = await p.then(() => null, (x: unknown) => x as { code?: string; message?: string });
    expect(e, "expected an error").not.toBeNull();
    expect(e?.code, e?.message).toBe(code);
    if (re) expect(e?.message).toMatch(re);
  };
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });
  const pdf = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 4096 });
  const hash = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const seedTags = async (track = "B") =>
    (await q1<{ key: string }>("select key from english.error_tags where track_id=$1 and origin='seed' and retired_at is null and key !~ '^nghe-' order by key limit 6", [track])).map((x) => x.key);
  type Cr = { id: string; status: string; replayed: boolean };
  const create = (by: string, o: { learner?: string; title?: string; day?: string; support?: string; hash?: string; clientId?: string; other?: boolean } = {}) =>
    svc<Cr>("select english.eng_create_import($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10) as r", [
      o.learner ?? NG(), o.title ?? `Progress Test ${randomUUID().slice(0, 6)}`, JSON.stringify(pdf()), JSON.stringify(pdf()), o.day ?? "2026-10-23",
      o.support ?? "tu_lam_chua", o.hash ?? hash(), by, o.clientId ?? randomUUID(), o.other ?? false,
    ]);
  const finishRead = (id: string) => svc("select english.eng_finish_import_read($1,$2::jsonb,null) as r", [id, JSON.stringify({ items: [] })]);
  const updatedAt = async (id: string) => (await q1<{ t: string }>("select updated_at::text as t from english.import_batches where id = $1", [id]))[0]!.t;
  /** results: one char per question: c = correct, i = incorrect, b = blank, p = paper only (out_of_app). tags: tag of every question (cycled). */
  const buildOf = (results: string, tags: string[]) => {
    const items: unknown[] = []; const keys: unknown[] = []; const meta: unknown[] = []; const res: unknown[] = [];
    [...results].forEach((ch, idx) => {
      const n = idx + 1; const tag = tags[idx % tags.length];
      meta.push({ n, part: "A", tag_key: tag, reading_skill_key: null, out_of_app: ch === "p" });
      if (ch === "p") return;
      items.push({ id: `q${n}`, kind: "short", stem: `Câu ${n}`, options: [], target_id: null });
      keys.push({ item_id: `q${n}`, kind: "answer", answer: "x", explanation_vi: null });
      res.push({ item_id: `q${n}`, result: ch === "c" ? "correct" : ch === "i" ? "incorrect" : "blank" });
    });
    return { template: { prompt_en: "Imported work.", time_min: 5, items }, keys, meta, results: res };
  };
  type Conf = { template_id: string; version: number; attempt_id: string; counted: number; tags: string[]; replayed: boolean };
  /** Whole path: create (by the tutor), AI read finished, confirmed by the tutor. */
  const importWork = async (o: { results: string; tags: string[]; day?: string; support?: string; learner?: string; title?: string; by?: string }) => {
    const by = o.by ?? M().tutorNguyen;
    const c = await create(by, { learner: o.learner, day: o.day, support: o.support, title: o.title });
    await finishRead(c.id);
    const conf = await svc<Conf>("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, await updatedAt(c.id), JSON.stringify(buildOf(o.results, o.tags)), by, randomUUID()]);
    return { ...c, ...conf };
  };
  type Pt = { tag_key: string; counted: { ref: string; day: number; correct: boolean; source_id: string }[]; supported_correct: number; supported_attempted: number; taught_unit: boolean; title_vi: string | null; decisions: unknown[] };
  const inputs = (learner = NG(), tags: string[] | null = null) =>
    svc<{ policy: { version: string } | null; points: Pt[] }>("select english.eng_point_inputs($1,$2) as r", [learner, tags]);
  const apply = (rows: unknown[], learner = NG()) => svc<{ auto: number; proposed: number; flagged: number }>("select english.eng_apply_point_results($1,$2::jsonb,'PP-eng-1') as r", [learner, JSON.stringify(rows)]);
  const ek = (n: number) => `${n}-${String(n).padStart(16, "0")}`;
  const row = (tag: string, o: Record<string, unknown>) => ({ tag_key: tag, conditions: [], evidence_key: ek(1), evidence: { auto: [], propose: [], flag: [] }, ...o });

  describe("1. attempts + template kind", () => {
    it("attempts has taken_on / support_level / source_hash; provenance accepts 'imported' only with a date and a support level", async () => {
      for (const col of ["taken_on", "support_level", "source_hash"]) {
        expect((await q1("select 1 as r from information_schema.columns where table_schema='english' and table_name='attempts' and column_name=$1", [col]))[0]).toEqual({ r: 1 });
      }
      const defs = await q1<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='english.attempts'::regclass and conname in ('attempts_provenance_check','attempts_imported_shape')");
      expect(defs.map((x) => x.d).join(" ")).toMatch(/imported/);
      expect(defs.length).toBe(2);
    });
    it("inquiry_templates.kind accepts 'imported' with an A-IM-/B-IM- id", async () => {
      const d = await q1<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='english.inquiry_templates'::regclass and conname in ('inquiry_templates_kind_check','inquiry_templates_id_check')");
      const all = d.map((x) => x.d).join(" ");
      expect(all).toMatch(/imported/);
      expect(all).toMatch(/IM-/);
    });
  });

  describe("2. point policy (PP-0.1 from 0028)", () => {
    it("point_policies holds PP-0.1 (immutable) and eng_point_policy() names it", async () => {
      expect((await q1("select to_regclass('english.point_policies') as r"))[0]).toEqual({ r: "english.point_policies" });
      expect(await svc<string | null>("select english.eng_point_policy() as r")).toBe("PP-0.1");
      const cfg = (await q1<{ c: { independent: { minCounted: number } } }>("select config as c from english.point_policies where version='PP-0.1'"))[0]?.c;
      expect(cfg?.independent.minCounted).toBe(4);
      await fail(db.client.query("update english.point_policies set config='{}'::jsonb where version='PP-0.1'"), "42501");
    });
    it("eng_point_level maps the five states and refuses an unknown one", async () => {
      expect(await svc<number>("select english.eng_point_level('INDEPENDENT') as r")).toBe(3);
      expect(await svc<number | null>("select english.eng_point_level('NOPE') as r")).toBeNull();
    });
    it("eng_vn_day agrees with the TypeScript vnDay around midnight in Vietnam", async () => {
      const a = await q1<{ d: number }>("select english.eng_vn_day('2026-10-23T16:59:59Z') as d");
      const b = await q1<{ d: number }>("select english.eng_vn_day('2026-10-23T17:00:00Z') as d");
      expect((b[0]?.d ?? 0) - (a[0]?.d ?? 0)).toBe(1);
    });
  });

  describe("3. point decisions + state", () => {
    it("exist, are append-only, and nobody (service_role included) writes them directly", async () => {
      for (const t of ["point_decisions", "point_state"]) {
        expect((await q1("select to_regclass($1) as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc("insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, evidence_key, policy_version, engine_version) values ($1,'cum-dong-tu','AUTO','NOT_OBSERVED','DEVELOPING','1-0000000000000000','PP-0.1','PP-eng-1') returning 1 as r", [NG()]), "42501");
    });
    it("students read nothing; the child's tutor and the parent read (RLS)", async () => {
      const read = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select count(*)::int as n from english.point_decisions where learner_id = $1", [NG()])).rows[0] as { n: number });
      expect((await read(s.users.studentNguyen)).n).toBe(0);
    });
    it("the projector exists and is closed to app roles", async () => {
      expect((await q1("select 1 as r from pg_proc where proname='eng_project_point_state'"))[0]).toEqual({ r: 1 });
    });
  });

  describe("7. create an import (tutor of the child or the parent; dedup; date)", () => {
    it("the parent and the child's tutor can upload; a tutor of another child, a student and a bad support level cannot", async () => {
      expect((await create(M().parent)).status).toBe("reading");
      expect((await create(M().tutorNguyen)).status).toBe("reading");
      await fail(create(M().tutorAn), "42501");
      await fail(create(M().tutorNguyen, { support: "nope" }), "22023", /\(bad_support\)/);
      await fail(create(M().tutorNguyen, { hash: "abc" }), "22023", /\(bad_hash\)/);
    });
    it("the same client id replays; the same file hash or the same title + day is a duplicate unless 'another time'", async () => {
      const h = hash();
      const a = await create(M().tutorNguyen, { hash: h, title: "Dup test", day: "2026-09-01", clientId: "dup-client-1" });
      expect((await create(M().tutorNguyen, { hash: h, title: "Dup test", day: "2026-09-01", clientId: "dup-client-1" })).replayed).toBe(true);
      await fail(create(M().tutorNguyen, { hash: h }), "23505", /\(duplicate_import\)/);
      await fail(create(M().tutorNguyen, { title: "dup TEST", day: "2026-09-01" }), "23505", /\(duplicate_import\)/);
      const other = await create(M().tutorNguyen, { hash: h, other: true });
      expect(other.id).not.toBe(a.id);
      // a discarded import no longer blocks
      const h2 = hash();
      const d = await create(M().tutorNguyen, { hash: h2 });
      await svc("select english.eng_discard_import($1,$2) as r", [d.id, M().parent]);
      expect((await create(M().tutorNguyen, { hash: h2 })).status).toBe("reading");
    });
    it("a day in the future is refused; a day long ago is fine", async () => {
      await fail(create(M().tutorNguyen, { day: "2999-01-01" }), "23514", /\(date_future\)/);
      expect((await create(M().tutorNguyen, { day: "2020-01-01" })).status).toBe("reading");
    });
    it("nobody writes the table directly; students read nothing", async () => {
      await fail(svc("insert into english.import_batches(family_id) values ($1) returning 1 as r", [s.familyId]), "42501");
      const read = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select count(*)::int as n from english.import_batches where learner_id = $1", [NG()])).rows[0] as { n: number });
      expect((await read(s.users.studentNguyen)).n).toBe(0);
      expect((await read(s.users.tutorNguyen)).n).toBeGreaterThan(0);
      expect((await read(s.users.parent)).n).toBeGreaterThan(0);
      expect((await read(s.users.tutorAn)).n).toBe(0);
    });
  });

  describe("8. confirm an import → imported template + attempt + auto-checks (the child's tutor only)", () => {
    it("builds A-/B-IM-, one imported attempt with day / support / hash, and the auto-checks; the child sees nothing", async () => {
      const [t1] = await seedTags();
      const before = await svc<{ auto: unknown[]; episodes: unknown[] }>("select english.eng_engine_inputs($1) as r", [NG()]);
      const got = await importWork({ results: "cciib", tags: [t1!], day: "2026-10-22", support: "tu_lam_chua", title: "Task 8 import" });
      expect(got.template_id).toMatch(/^B-IM-\d{6}$/);
      expect(got.counted).toBe(4);
      const a = (await q1<{ provenance: string; taken_on: string; support_level: string; source_hash: string; declared_assistance: string[] }>(
        "select provenance, taken_on::text, support_level, source_hash, declared_assistance from english.attempts where id=$1", [got.attempt_id]))[0]!;
      expect(a).toMatchObject({ provenance: "imported", taken_on: "2026-10-22", support_level: "tu_lam_chua", declared_assistance: ["none"] });
      expect(a.source_hash).toMatch(/^[0-9a-f]{64}$/);
      const checks = (await q1<{ checks: { items: Record<string, { result: string }> } }>("select checks from english.attempt_auto_checks where attempt_id=$1", [got.attempt_id]))[0]!.checks;
      expect(Object.values(checks.items).map((x) => x.result)).toEqual(["correct", "correct", "incorrect", "incorrect", "blank"]);
      expect((await q1("select count(*)::int as n from english.studio_item_meta where template_id=$1", [got.template_id]))[0]).toEqual({ n: 5 });
      // R2: S7a evidence for the skill states is unchanged by an import
      const after = await svc<{ auto: unknown[]; episodes: unknown[] }>("select english.eng_engine_inputs($1) as r", [NG()]);
      expect(after.auto).toEqual(before.auto);
      expect(after.episodes).toEqual(before.episodes);
      // the child sees nothing: not the attempt, not the template in the home list
      const mine = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => ({
        attempts: ((await q("select count(*)::int as n from english.attempts where provenance='imported'")).rows[0] as { n: number }).n,
        home: JSON.stringify((await q("select english.eng_my_home() as r")).rows[0]),
        list: JSON.stringify((await q("select english.eng_my_inquiries() as r")).rows[0]),
        checks: ((await q("select count(*)::int as n from english.attempt_auto_checks")).rows[0] as { n: number }).n,
      }));
      const st = await mine(s.users.studentNguyen);
      expect(st.attempts).toBe(0);
      expect(st.home).not.toContain("Task 8 import");
      expect(st.list).not.toContain("Task 8 import");
      expect(st.checks).toBe(0);
      expect((await mine(s.users.tutorNguyen)).attempts).toBeGreaterThan(0);
    });
    it("the parent and another child's tutor cannot confirm; a build that does not match, or a tag outside the list, is refused; a stale base is refused; replay returns the same attempt", async () => {
      const [t1] = await seedTags();
      const c = await create(M().tutorNguyen);
      await finishRead(c.id);
      const base = await updatedAt(c.id);
      const ok = JSON.stringify(buildOf("cc", [t1!]));
      await fail(svc("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, ok, M().parent, randomUUID()]), "42501", /\(tutor_only\)/);
      await fail(svc("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, ok, M().tutorAn, randomUUID()]), "42501");
      const bad = buildOf("cc", [t1!]); bad.results.pop();
      await fail(svc("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, JSON.stringify(bad), M().tutorNguyen, randomUUID()]), "22023", /\(bad_build\)/);
      await fail(svc("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, JSON.stringify(buildOf("cc", ["not-a-tag-xyz"])), M().tutorNguyen, randomUUID()]), "22023", /\(bad_tag\)/);
      await fail(svc("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, "2020-01-01T00:00:00Z", ok, M().tutorNguyen, randomUUID()]), "23505", /\(draft_changed\)/);
      const first = await svc<Conf>("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, ok, M().tutorNguyen, randomUUID()]);
      const again = await svc<Conf>("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, base, ok, M().tutorNguyen, randomUUID()]);
      expect(again).toMatchObject({ attempt_id: first.attempt_id, replayed: true });
      // a confirmed batch can no longer be discarded
      await fail(svc("select english.eng_discard_import($1,$2) as r", [c.id, M().parent]), "23514", /\(not_open\)/);
    });
  });

  describe("4. point inputs (counted closed questions per tag)", () => {
    it("reads graded closed questions; blank and paper-only are not counted; 'with the tutor' is supported, not counted; policy is PP-0.1", async () => {
      const [, t2, t3] = await seedTags();
      await importWork({ results: "ccccc", tags: [t2!], day: "2026-10-23", title: "Task 4 A" });
      await importWork({ results: "cip", tags: [t3!], day: "2026-10-24", title: "Task 4 B" });
      await importWork({ results: "cccccc", tags: [t3!], day: "2026-10-25", support: "lam_cung_co", title: "Task 4 C" });
      const got = await inputs();
      expect(got.policy?.version).toBe("PP-0.1");
      const p2 = got.points.find((p) => p.tag_key === t2)!;
      expect(p2.counted).toHaveLength(5);
      expect(p2.counted.every((x) => x.correct)).toBe(true);
      expect(new Set(p2.counted.map((x) => x.day)).size).toBe(1);
      expect(p2.title_vi).toBeTruthy();
      const p3 = got.points.find((p) => p.tag_key === t3)!;
      expect(p3.counted).toHaveLength(2); // c and i of Task 4 B; the paper-only one is out
      expect(p3.supported_correct).toBe(6);
      expect(p3.supported_attempted).toBe(6);
      expect((await inputs(NG(), [t2!])).points.map((p) => p.tag_key)).toEqual([t2]);
      // an imported day is the day the work was done, not the day it was typed in
      expect(p2.counted[0]!.day).toBe(Math.floor(Date.parse("2026-10-23T00:00:00Z") / 86_400_000));
    });
  });

  describe("5. apply point results (never down, no duplicates)", () => {
    it("AUTO + PROPOSED once; the same results again write nothing; AUTO never goes down; one open proposal", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử điểm','B',true,'active') returning id", [s.familyId]))[0]!.id;
      const tag = "cum-dong-tu";
      const r1 = await apply([row(tag, { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(7), evidence_key: ek(1), evidence: { auto: ["T:q1:a"], propose: ["T:q1:a", "T:q2:a"], flag: [] } })], L);
      expect(r1).toMatchObject({ auto: 1, proposed: 1, flagged: 0 });
      expect(await apply([row(tag, { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(7) })], L)).toMatchObject({ auto: 0, proposed: 0 });
      expect(await apply([row(tag, { auto: "SUPPORTED", propose: "INDEPENDENT", propose_key: ek(8) })], L)).toMatchObject({ auto: 0, proposed: 0 }); // one open proposal
      const st = (await q1<{ state: string; proposal_decision_id: string | null }>("select state, proposal_decision_id from english.point_state where learner_id=$1 and tag_key=$2", [L, tag]))[0]!;
      expect(st.state).toBe("DEVELOPING");
      expect(st.proposal_decision_id).not.toBeNull();
      await fail(apply([row(tag, { auto: "DEVELOPING", propose: "TRANSFERABLE", propose_key: ek(9) })], L), "23514").catch(() => undefined);
      await fail(apply([{ tag_key: "BAD KEY", conditions: [], evidence_key: ek(1) }], L), "22023", /\(bad_results\)/);
      await fail(svc("select english.eng_apply_point_results($1,'[]'::jsonb,'bad version!') as r", [L]), "22023");
      await q1("delete from english.point_state where learner_id=$1", [L]).catch(() => undefined);
    });
    it("level 4 only from 'Tự làm được'; ⚑ only at level ≥ 2, once per evidence; app roles cannot call it", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử cờ','B',true,'active') returning id", [s.familyId]))[0]!.id;
      const tag = "thanh-ngu";
      await apply([row(tag, { propose: "TRANSFERABLE", propose_key: ek(5) })], L);
      expect((await q1("select count(*)::int as n from english.point_decisions where learner_id=$1 and kind='PROPOSED'", [L]))[0]).toEqual({ n: 0 });
      await apply([row(tag, { raise_flag: true, flag_key: ek(6) })], L);
      expect((await q1("select count(*)::int as n from english.point_decisions where learner_id=$1 and kind='FLAG'", [L]))[0]).toEqual({ n: 0 });
      await apply([row(tag, { auto: "DEVELOPING" })], L);
      expect(await apply([row(tag, { raise_flag: true, flag_key: ek(6) })], L)).toMatchObject({ flagged: 1 });
      expect(await apply([row(tag, { raise_flag: true, flag_key: ek(6) })], L)).toMatchObject({ flagged: 0 });
      await fail(asCommit(db.client, "authenticated", s.users.tutorNguyen, (q) => q("select english.eng_apply_point_results($1,'[]'::jsonb,'x1')", [L])), "42501");
    });
    it("reset rebuilds point_state from the book without writing new rows", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử lại','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await apply([row("cum-dong-tu", { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(7) })], L);
      const before = (await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [L]))[0]!.n;
      await svc("select english.eng_reset_point_states($1,$2) as r", [L, M().tutorNguyen]);
      await fail(svc("select english.eng_reset_point_states($1,$2) as r", [L, M().tutorAn]), "42501", /\(staff_only\)/);
      expect((await q1("select state from english.point_state where learner_id=$1 and tag_key='cum-dong-tu'", [L]))[0]).toEqual({ state: "DEVELOPING" });
      expect((await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [L]))[0]!.n).toBe(before);
    });
  });

  describe("6. the tutor decides, the parent reads, inbox and map", () => {
    it("the child's tutor confirms ('Tự làm được'); the parent and another tutor cannot; 'Chưa' needs a reason; a second answer is refused", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử duyệt','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await apply([row("cum-dong-tu", { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(7) }), row("thanh-ngu", { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(8) })], L);
      type Inbox = { open: number; decidable: number; items: { id: string; learner_id: string; tag_key: string; can_decide: boolean; to_state: string; evidence: unknown[] }[] };
      const inbox = (by: string) => svc<Inbox>("select english.eng_point_inbox($1, false) as r", [by]);
      const mine = (await inbox(M().tutorNguyen)).items.filter((i) => i.learner_id === L);
      expect(mine).toHaveLength(2);
      expect(mine.every((i) => i.can_decide && i.to_state === "INDEPENDENT")).toBe(true);
      expect((await inbox(M().parent)).items.every((i) => !i.can_decide)).toBe(true);
      expect((await inbox(M().tutorAn)).items.filter((i) => i.learner_id === L)).toHaveLength(0);
      const decide = (id: string, act: string, by: string, reason: string | null = null, client = randomUUID()) =>
        svc<{ id: string; replayed: boolean }>("select english.eng_decide_point($1,$2,$3,$4,$5) as r", [id, act, reason, by, client]);
      const a = mine.find((i) => i.tag_key === "cum-dong-tu")!; const b = mine.find((i) => i.tag_key === "thanh-ngu")!;
      await fail(decide(a.id, "confirm", M().parent), "42501", /\(tutor_only\)/);
      await fail(decide(a.id, "confirm", M().tutorAn), "42501", /\(tutor_only\)/);
      await fail(decide(b.id, "reject", M().tutorNguyen), "23514", /\(reason_required\)/);
      const cid = randomUUID();
      const done = await decide(a.id, "confirm", M().tutorNguyen, null, cid);
      expect(done.replayed).toBe(false);
      expect((await decide(a.id, "confirm", M().tutorNguyen, null, cid)).replayed).toBe(true);
      await fail(decide(a.id, "reject", M().tutorNguyen, "chưa đủ"), "23505", /\(already_answered\)/);
      await decide(b.id, "reject", M().tutorNguyen, "Còn sai nhiều");
      const st = await q1<{ tag_key: string; state: string }>("select tag_key, state from english.point_state where learner_id=$1 order by tag_key", [L]);
      expect(st).toEqual([{ tag_key: "cum-dong-tu", state: "INDEPENDENT" }, { tag_key: "thanh-ngu", state: "DEVELOPING" }]);
      // a proposal answered 'Chưa' is not proposed again on the same evidence
      expect(await apply([row("thanh-ngu", { propose: "INDEPENDENT", propose_key: ek(8) })], L)).toMatchObject({ proposed: 0 });
      expect((await inbox(M().tutorNguyen)).items.filter((i) => i.learner_id === L)).toHaveLength(0);
    });
    it("the map lists every point with evidence by question (right / wrong / with help) and the level, without raw scores", async () => {
      const [, , , t4] = await seedTags();
      await importWork({ results: "cic", tags: [t4!], day: "2026-10-26", title: "Task 6 map" });
      await importWork({ results: "cc", tags: [t4!], day: "2026-10-27", support: "lam_cung_co", title: "Task 6 map 2" });
      const map = await svc<{ points: { tag_key: string; state: string; group_vi: string | null; answers: { correct: boolean; support: boolean; title: string; at: string }[] }[] }>("select english.eng_point_map($1) as r", [NG()]);
      const pt = map.points.find((p) => p.tag_key === t4)!;
      expect(pt.answers.map((a) => [a.correct, a.support])).toEqual([[true, false], [false, false], [true, false], [true, true], [true, true]]);
      expect(pt.answers[0]!.at).toBe("2026-10-26");
      expect(JSON.stringify(map)).not.toMatch(/"score"|"percent"|"points_earned"/);
    });
  });

  describe("9. AI purpose read_answers", () => {
    it("the gate and the run log accept it and refuse an unknown purpose", async () => {
      const ok = await svc<{ allowed: boolean }>("select english.eng_ai_gate($1, 0.01, false, null, 'm', $2, 'read_answers') as r", [NG(), M().parent]);
      expect(typeof ok.allowed).toBe("boolean");
      await fail(svc("select english.eng_ai_gate($1, 0.01, false, null, 'm', $2, 'nonsense') as r", [NG(), M().parent]), "22023", /\(bad_purpose\)/);
      const id = await svc<string>("select english.eng_log_ai_run($1, null, 'm', 'read-answers.v1', 10, 5, 0.01, 'ok', null, $2, null, 'read_answers') as r", [s.familyId, M().parent]);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect((await q1<{ purpose: string }>("select purpose from english.ai_runs where id=$1", [id]))[0]).toEqual({ purpose: "read_answers" });
    });
  });

  describe("10. purge", () => {
    it("the dry run and the purge count point_decisions, point_state, import_batches and the imported attempt the same way; the other child keeps his", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa W3','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await q1("insert into english.target_sets(learner_id, definition_id, assigned_by) select $1, definition_id, assigned_by from english.target_sets where learner_id=$2 order by effective_from desc limit 1", [L, NG()]);
      const nBefore = (await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [NG()]))[0]!.n;
      const tag = (await seedTags())[0]!;
      const got = await importWork({ results: "ccc", tags: [tag], learner: L, title: "Purge import" });
      expect(got.counted).toBe(3);
      await apply([row(tag, { auto: "DEVELOPING", propose: "INDEPENDENT", propose_key: ek(7) })], L);
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts).toMatchObject({ point_decisions: 2, point_state: 1, import_batches: 1, attempts: 1, attempt_auto_checks: 1, studio_templates: 1, studio_template_keys: 3 });
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toMatchObject({ point_decisions: 2, point_state: 1, import_batches: 1, attempts: 1, studio_templates: 1 });
      expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
      expect(await q1("select count(*)::int as n from english.import_batches where learner_id=$1", [L])).toEqual([{ n: 0 }]);
      expect(await q1("select count(*)::int as n from english.inquiry_templates where learner_id=$1", [L])).toEqual([{ n: 0 }]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [NG()]))[0]!.n).toBe(nBefore);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.import_batches where learner_id=$1", [NG()]))[0]!.n).toBeGreaterThan(0);
    });
  });

  describe("11. the TypeScript point engine on the real database (DOMAIN §5.2 examples 1 and 2)", () => {
    it("Progress Test then homework: level 2 (AUTO) then a proposal for 'Tự làm được'; again → nothing new; rebuild twice → the same book", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử engine','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      await q1("insert into english.target_sets(learner_id, definition_id, assigned_by) select $1, definition_id, assigned_by from english.target_sets where learner_id=$2 order by effective_from desc limit 1", [L, NG()]);
      const [tag] = await seedTags();
      const store = pgPointStore(db.client);
      await importWork({ results: "ccccc", tags: [tag!], learner: L, day: "2026-10-23", support: "tu_lam_chua", title: "Progress Test U1-12" });
      const a = await recomputePoints(store, L);
      expect(a.applied).toMatchObject({ auto: 1, proposed: 0 });
      expect((await q1("select state from english.point_state where learner_id=$1 and tag_key=$2", [L, tag]))[0]).toEqual({ state: "DEVELOPING" });
      await importWork({ results: "ccccn".replace("n", "i"), tags: [tag!], learner: L, day: "2026-11-05", support: "tu_lam", title: "Bài về nhà 05/11" });
      const b = await recomputePoints(store, L);
      expect(b.applied).toMatchObject({ auto: 0, proposed: 1 });
      const prop = (await q1<{ to_state: string; evidence_item_refs: string[] }>("select to_state, evidence_item_refs from english.point_decisions where learner_id=$1 and kind='PROPOSED'", [L]))[0]!;
      expect(prop.to_state).toBe("INDEPENDENT");
      expect(prop.evidence_item_refs).toHaveLength(10);
      expect((await recomputePoints(store, L)).applied).toMatchObject({ auto: 0, proposed: 0, flagged: 0 });
      const rows = (await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [L]))[0]!.n;
      await rebuildPoints(store, L, M().tutorNguyen);
      await rebuildPoints(store, L, M().tutorNguyen);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.point_decisions where learner_id=$1", [L]))[0]!.n).toBe(rows);
      // the TypeScript and SQL projections agree
      const book = await q1<{ id: string; seq: string; kind: "AUTO"; from_state: "NOT_OBSERVED"; to_state: "DEVELOPING"; evidence_key: string | null; responds_to: string | null; created_at: Date }>(
        "select id, seq, kind, from_state, to_state, evidence_key, responds_to, created_at from english.point_decisions where learner_id=$1 and tag_key=$2", [L, tag]);
      const proj = projectPointDecisions(book.map((d) => ({ id: d.id, seq: Number(d.seq), kind: d.kind, fromState: d.from_state, toState: d.to_state, evidenceKey: d.evidence_key, respondsTo: d.responds_to, createdAt: d.created_at.toISOString() })));
      const st = (await q1<{ state: string; proposal_decision_id: string | null }>("select state, proposal_decision_id from english.point_state where learner_id=$1 and tag_key=$2", [L, tag]))[0]!;
      expect(proj.state).toBe(st.state);
      expect(proj.openProposal?.id ?? null).toBe(st.proposal_decision_id);
      // confirm through the function, then recompute: "Tự làm được" and nothing new
      await svc("select english.eng_decide_point($1,'confirm',null,$2,$3) as r", [st.proposal_decision_id, M().tutorNguyen, randomUUID()]);
      expect((await recomputePoints(store, L)).applied).toMatchObject({ auto: 0, proposed: 0, flagged: 0 });
      expect((await q1("select state from english.point_state where learner_id=$1 and tag_key=$2", [L, tag]))[0]).toEqual({ state: "INDEPENDENT" });
      // the evidence key is stable when a MANUAL row is written
      expect(await pointEvidenceKeyFor(store, L, tag!)).toMatch(/^[0-9]+-[0-9a-f]{16}$/);
    });
  });
});
