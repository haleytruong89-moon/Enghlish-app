import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

const FORBIDDEN_KEY = /^(score|scores|correct|expected|answer|answers|explanation|explanation_vi|tag_key|tag_keys|level_num|pct|percent|result|results|wrong|rubric|verdict|decision|state|kind|conditions|evidence|assumed|assumed_level|proposal|flag)$/;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

type Levels = { domains: { key: string; name: string; level: string | null; on: string | null }[] };
type Cando = { now: string; items: { code: string | null; name: string; at: string }[]; ever: { n: number; at: string }[] };

/** W4e (migration 0036): what the child reads of levels and "những điều đã làm được". One database. */
describe("student levels and can-do (migration 0036)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const read = <T = unknown>(user: string, sql: string) => as(db.client, "authenticated", user, async (q) => ((await q(sql)).rows[0] as { r: T }).r);
  const levels = (user: string) => read<Levels | null>(user, "select english.eng_my_levels() as r");
  const cando = (user: string) => read<Cando | null>(user, "select english.eng_my_cando() as r");
  const record = (by: string, learner: string, kind: string, lv: Record<string, string>, reason: string | null = null) =>
    svc("select english.eng_record_level($1, $2, $3::jsonb, $4, $5, $6) as r", [learner, kind, JSON.stringify(lv), reason, by, randomUUID()]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("eng_my_levels", () => {
    it("before the tutor confirms anything: the CEFR domains with NO level (an assumed level is never sent), and no Tư duy domain", async () => {
      const b = (await levels(U().studentNguyen))!;
      expect(b.domains.map((d) => d.key)).toEqual(["grammar", "vocab", "reading", "listening", "writing", "speaking"]);
      for (const d of b.domains) expect(d).toMatchObject({ level: null, on: null });
      const a = (await levels(U().studentAn))!;
      expect(a.domains.every((d) => d.level === null)).toBe(true);
    });
    it("after the baseline: only the confirmed domains carry a level and a date; the task-level domain is never there; the newest decision wins", async () => {
      await record(M().tutorNguyen, NG(), "baseline", { grammar: "B2", listening: "B1+", thinking: "3" }, "Buổi đầu");
      const v = (await levels(U().studentNguyen))!;
      const by = Object.fromEntries(v.domains.map((d) => [d.key, d]));
      expect(by.grammar).toMatchObject({ level: "B2" });
      expect(by.grammar!.on).not.toBeNull();
      expect(by.listening).toMatchObject({ level: "B1+" });
      expect(by.vocab).toMatchObject({ level: null, on: null });
      expect(by.thinking).toBeUndefined();
      expect(JSON.stringify(v)).not.toContain('"3"');
      await record(M().tutorNguyen, NG(), "adjust", { grammar: "C1" }, "Làm bài rất tốt");
      expect((await levels(U().studentNguyen))!.domains.find((d) => d.key === "grammar")!.level).toBe("C1");
    });
    it("the other child sees none of it; an adult or a stranger gets null; no score-like keys", async () => {
      expect((await levels(U().studentAn))!.domains.every((d) => d.level === null)).toBe(true);
      expect(await levels(U().parent)).toBeNull();
      expect(await levels(U().tutorNguyen)).toBeNull();
      for (const who of [U().studentNguyen, U().studentAn]) expect(keysOf(await levels(who)).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
      expect(Object.keys((await levels(U().studentNguyen))!.domains[0]!).sort()).toEqual(["key", "level", "name", "on"]);
    });
  });

  describe("eng_my_cando", () => {
    let reqNo = 0;
    const evKey = () => `${(reqNo += 1)}-${"a".repeat(16)}`;
    /** A skill / knowledge item walked up in the book as the table owner: proposed, then answered by the tutor. */
    const skillRow = (learner: string, target: string, kind: string, from: string, to: string, extra: { responds?: string | null; member?: string; reason?: string } = {}) =>
      q1<{ id: string }>(
        `insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, policy_version, engine_version, evidence_key, decided_by_member, decided_role, reason, responds_to, client_id)
         values ($1, $2, $3, $4, $5, 'AP-0.3', $6, $7, $8, $9, $10, $11, $12) returning id`,
        [learner, target, kind, from, to, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? "S7a-1" : null, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? evKey() : null,
         ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : extra.member, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : "tutor", extra.reason ?? null, extra.responds ?? null,
         ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : `c-${randomUUID()}`],
      );
    const project = (learner: string, target: string) => q1("select english.eng_project_skill_state($1, $2)", [learner, target]);
    const confirmSkill = async (learner: string, member: string, target: string, to = "INDEPENDENT") => {
      const p = (await skillRow(learner, target, "PROPOSED", "DEVELOPING", to))[0]!.id;
      const c = (await skillRow(learner, target, "CONFIRMED", "DEVELOPING", to, { responds: p, member }))[0]!.id;
      await project(learner, target);
      return c;
    };
    const pointRow = (learner: string, tag: string, kind: string, from: string, to: string, extra: { responds?: string | null; member?: string; reason?: string } = {}) =>
      q1<{ id: string }>(
        `insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, policy_version, engine_version, evidence_key, decided_by_member, decided_role, reason, responds_to, client_id)
         values ($1, $2, $3, $4, $5, 'PP-0.1', $6, $7, $8, $9, $10, $11, $12) returning id`,
        [learner, tag, kind, from, to, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? "PP-eng-1" : null, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? evKey() : null,
         ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : extra.member, ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : "tutor", extra.reason ?? null, extra.responds ?? null,
         ["AUTO", "PROPOSED", "FLAG"].includes(kind) ? null : `c-${randomUUID()}`],
      );
    const projectPoint = (learner: string, tag: string) => q1("select english.eng_project_point_state($1, $2)", [learner, tag]);
    const confirmPoint = async (learner: string, member: string, tag: string) => {
      const p = (await pointRow(learner, tag, "PROPOSED", "DEVELOPING", "INDEPENDENT"))[0]!.id;
      await pointRow(learner, tag, "CONFIRMED", "DEVELOPING", "INDEPENDENT", { responds: p, member });
      await projectPoint(learner, tag);
    };
    const names = async (user: string) => (await cando(user))!.items.map((i) => i.name);
    const titleOf = async (id: string, track: string) => (await q1<{ title_vi: string }>("select title_vi from english.targets where id = $1 and track_id = $2 order by descriptor_version desc limit 1", [id, track]))[0]!.title_vi;
    const labelOf = async (key: string, track: string) => (await q1<{ label_vi: string }>("select label_vi from english.error_tags where key = $1 and track_id = $2 and family_id is null", [key, track]))[0]!.label_vi;

    it("nothing at the start; the only fields are now and items", async () => {
      const c = (await cando(U().studentNguyen))!;
      expect(c.items).toEqual([]);
      expect(c.ever).toEqual([]);
      expect(Object.keys(c).sort()).toEqual(["ever", "items", "now"]);
    });
    it("level 1–2 (AUTO), an open proposal and an open flag do NOT count; a confirmed 3–4 does, with the skill's Vietnamese title", async () => {
      const T = "B-T1-EXAM-R";
      await skillRow(NG(), T, "AUTO", "NOT_OBSERVED", "DEVELOPING");
      await project(NG(), T);
      expect(await names(U().studentNguyen)).toEqual([]);
      const open = (await skillRow(NG(), T, "PROPOSED", "DEVELOPING", "INDEPENDENT"))[0]!.id;
      await project(NG(), T);
      expect(await names(U().studentNguyen)).toEqual([]); // proposed, not yet confirmed: the child sees nothing
      await skillRow(NG(), T, "CONFIRMED", "DEVELOPING", "INDEPENDENT", { responds: open, member: M().tutorNguyen });
      await project(NG(), T);
      expect(await names(U().studentNguyen)).toEqual([await titleOf(T, "B")]);
      // an open flag (⚑) on the confirmed skill changes nothing the child sees (no ⚑, no "waiting")
      await skillRow(NG(), T, "FLAG", "INDEPENDENT", "INDEPENDENT");
      await project(NG(), T);
      expect(await names(U().studentNguyen)).toEqual([await titleOf(T, "B")]);
    });
    it("a skill that fell back (the tutor lowered it by hand) is hidden quietly; confirming again brings it back", async () => {
      const T = "B-L2-CLOZE";
      await confirmSkill(NG(), M().tutorNguyen, T, "TRANSFERABLE");
      expect(await names(U().studentNguyen)).toContain(await titleOf(T, "B"));
      await skillRow(NG(), T, "MANUAL", "TRANSFERABLE", "DEVELOPING", { member: M().tutorNguyen, reason: "Còn hay nhầm" });
      await project(NG(), T);
      expect(await names(U().studentNguyen)).not.toContain(await titleOf(T, "B"));
      await confirmSkill(NG(), M().tutorNguyen, T, "INDEPENDENT");
      expect(await names(U().studentNguyen)).toContain(await titleOf(T, "B"));
    });
    it("a knowledge item confirmed at 3–4 counts with its label; an AUTO one does not; the name of a family's own tag is for that family only", async () => {
      const good = "cau-dieu-kien-dao-ngu";
      await confirmPoint(NG(), M().tutorNguyen, good);
      expect(await names(U().studentNguyen)).toContain(await labelOf(good, "B"));
      const auto = "wish-would-rather";
      await pointRow(NG(), auto, "AUTO", "NOT_OBSERVED", "DEVELOPING");
      await projectPoint(NG(), auto);
      expect(await names(U().studentNguyen)).not.toContain(await labelOf(auto, "B"));
    });
    it("newest first; the code is only for skills; the other child sees only their own; an adult gets null; no score-like keys", async () => {
      const c = (await cando(U().studentNguyen))!;
      expect(c.items.length).toBeGreaterThanOrEqual(3);
      expect(c.items.map((i) => i.at)).toEqual([...c.items.map((i) => i.at)].sort().reverse());
      expect(c.items.filter((i) => i.code === null).length).toBeGreaterThan(0);
      expect(Object.keys(c.items[0]!).sort()).toEqual(["at", "code", "name"]);
      expect(await names(U().studentAn)).toEqual([]);
      await confirmSkill(AN(), M().tutorAn, "A-T1-TEXT-R");
      const an = (await cando(U().studentAn))!;
      expect(an.items).toEqual([{ code: "A-T1-TEXT-R", name: await titleOf("A-T1-TEXT-R", "A"), at: expect.any(String) }]);
      expect(await names(U().studentNguyen)).not.toContain(an.items[0]!.name);
      expect(await cando(U().parent)).toBeNull();
      expect(await cando(U().tutorAn)).toBeNull();
      for (const who of [U().studentNguyen, U().studentAn]) expect(keysOf(await cando(who)).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    });
    it("a retired tag and a family's own x- tag are never a can-do card", async () => {
      const before = (await cando(U().studentNguyen))!.items.length;
      const retired = (await q1<{ key: string }>("select key from english.error_tags where track_id = 'B' and family_id is null and retired_at is not null limit 1").catch(() => []))[0]?.key;
      if (retired) {
        await confirmPoint(NG(), M().tutorNguyen, retired);
        expect(await names(U().studentNguyen)).not.toContain(await labelOf(retired, "B"));
      }
      const fam = (await q1<{ family_id: string }>("select family_id from english.learners where id = $1", [NG()]))[0]!.family_id;
      await q1("insert into english.error_tags(key, track_id, family_id, label_vi, domain) values ('x-thu-nghiem', 'B', $1, 'Nhãn riêng thử', 'grammar') on conflict do nothing", [fam]).catch(() => undefined);
      await confirmPoint(NG(), M().tutorNguyen, "x-thu-nghiem").catch(() => undefined);
      expect(await names(U().studentNguyen)).not.toContain("Nhãn riêng thử");
      expect((await cando(U().studentNguyen))!.items.length).toBeGreaterThanOrEqual(before);
    });
    it("'ever' keeps the first time of the 5th item even after a skill is lowered", async () => {
      const skills = ["B-T1-EXAM-R", "B-L2-CLOZE"];
      const c0 = (await cando(U().studentNguyen))!;
      const have = c0.items.length;
      // earn enough distinct items to pass 5
      const more = (await q1<{ id: string }>("select id from english.targets where track_id = 'B' and id like 'B-%' order by id limit 40")).map((r) => r.id).filter((id) => !c0.items.some((i) => i.code === id));
      for (const id of more.slice(0, Math.max(0, 6 - have))) await confirmSkill(NG(), M().tutorNguyen, id);
      const c1 = (await cando(U().studentNguyen))!;
      expect(c1.items.length).toBeGreaterThanOrEqual(5);
      const fifth = c1.ever.find((e) => e.n === 5);
      expect(fifth).toBeTruthy();
      // lower one skill: the shown list shrinks, the badge time does not move
      const target = c1.items.find((i) => i.code && skills.concat(more).includes(i.code))!.code!;
      await skillRow(NG(), target, "MANUAL", "INDEPENDENT", "DEVELOPING", { member: M().tutorNguyen, reason: "Còn hay nhầm" });
      await project(NG(), target);
      const c2 = (await cando(U().studentNguyen))!;
      expect(c2.items.length).toBe(c1.items.length - 1);
      expect(c2.ever.find((e) => e.n === 5)).toEqual(fifth);
      expect(c2.ever.map((e) => e.n)).toEqual(c1.ever.map((e) => e.n));
    });
  });
});
