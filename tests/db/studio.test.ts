import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/lib/migrate";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- asCommit is used by the later Studio tasks
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** Studio B1 (migration 0024): tables, guards, RLS; then approve → assign → work → verdicts → result → purge. One database for the file. */
describe("Studio B1 (migration 0024)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  /** A bare draft row written as the table owner (tests only: the app writes through the functions of Task 3). */
  const rawDraft = async (learner: string, status = "draft") =>
    (await q1<{ id: string }>(
      `insert into english.studio_drafts(family_id, learner_id, track_id, title, status, created_by_member, updated_by_member, client_id)
       select l.family_id, l.id, l.track_id, 'Đề thử', $2, $3, $3, $4 from english.learners l where l.id = $1 returning id`,
      [learner, status, s.members.parent, `raw-${randomUUID()}`],
    ))[0]!.id;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. tables, guards, RLS", () => {
    it("applies twice without error (idempotent)", async () => {
      await applyMigrations(db.client, { all: true });
      expect((await q1("select 1 from english.schema_migrations where version = '0024'")).length).toBe(1);
    });

    it("weekly topics keep their rules; Studio ids and owners are checked", async () => {
      expect(await q1("select count(*)::int as n from english.inquiry_templates where kind <> 'topic'")).toEqual([{ n: 0 }]);
      const tpl = (await q1<Record<string, unknown>>("select * from english.inquiry_templates where id = 'B-W1-HOMEWORK' and version = 1"))[0]!;
      // a Studio row needs its own id pattern and an owner; a topic row may not have an owner
      await fail(
        q1(
          `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
             target_ids, steps, sources, catalogue_version, source_hash, kind)
           values ('B-W9-X', 1, 'B', 't', 't', 't', 0, current_date, current_date, 'studio', '{}', $1, '[]', $2, 'h', 'studio')`,
          [JSON.stringify(tpl.steps), tpl.catalogue_version],
        ),
        "23514",
      );
      await fail(
        q1(
          `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
             target_ids, steps, sources, catalogue_version, source_hash, kind, family_id, learner_id)
           values ('B-ST-000999', 1, 'B', 't', 't', 't', 0, current_date, current_date, 'studio', '{}', $1, '[]', $2, 'h', 'topic', $3, $4)`,
          [JSON.stringify(tpl.steps), tpl.catalogue_version, s.familyId, s.learners.nguyen],
        ),
        "23514",
      );
    });

    it("a draft changes only while it is a draft, along the allowed steps; it is never deleted outside the purge", async () => {
      const id = await rawDraft(s.learners.nguyen, "extracting");
      await q1("update english.studio_drafts set status = 'draft', payload = '{\"parts\":[],\"passages\":[],\"items\":[]}' where id = $1", [id]);
      await fail(q1("update english.studio_drafts set status = 'extracting' where id = $1", [id]), "23514");
      await fail(q1("update english.studio_drafts set learner_id = $2 where id = $1", [id, s.learners.an]), "42501");
      await fail(q1("update english.studio_drafts set payload = '[]' where id = $1", [id]), "23514");
      await q1("update english.studio_drafts set status = 'discarded' where id = $1", [id]);
      await fail(q1("update english.studio_drafts set title = 'x' where id = $1", [id]), "42501");
      await fail(q1("delete from english.studio_drafts where id = $1", [id]), "42501");
      await fail(q1("truncate english.studio_drafts"), "42501");
    });

    it("AI tables: no app role reads them; nobody writes them directly; ai_runs never changes", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const t of ["ai_settings", "ai_runs"]) {
          expect((await q1<{ ok: boolean }>(`select has_table_privilege('${role}', 'english.${t}', 'select') as ok`))[0]?.ok, `${role} ${t}`).toBe(false);
        }
      }
      for (const t of ["ai_settings", "ai_runs", "studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"]) {
        for (const priv of ["insert", "update", "delete"]) {
          expect((await q1<{ ok: boolean }>(`select has_table_privilege('service_role', 'english.${t}', '${priv}') as ok`))[0]?.ok, `${t} ${priv}`).toBe(false);
        }
      }
      const run = (await q1<{ id: string }>("insert into english.ai_runs(family_id, purpose, status) values ($1, 'studio_extract', 'refused_off') returning id", [s.familyId]))[0]!.id;
      await fail(q1("update english.ai_runs set error_code = 'x' where id = $1", [run]), "42501");
      await fail(q1("delete from english.ai_runs where id = $1", [run]), "42501");
      await fail(q1("insert into english.ai_runs(family_id, purpose, status, cost_usd) values ($1, 'studio_extract', 'refused_cap', 0.01)", [s.familyId]), "23514");
      await fail(q1("insert into english.ai_settings(family_id, monthly_cap_usd) values ($1, 11)", [s.familyId]), "23514");
    });

    it("students read no Studio table; the other child's tutor reads nothing of this child", async () => {
      await rawDraft(s.learners.nguyen);
      for (const u of [s.users.studentAn, s.users.studentNguyen, s.users.tutorAn]) {
        for (const t of ["studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"]) {
          expect(await rowsAs(db.client, "authenticated", u, `select * from english.${t} where learner_id = $1`, [s.learners.nguyen]), `${t}`).toEqual([]);
        }
      }
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select id from english.studio_drafts")).length).toBeGreaterThan(0);
      expect((await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.studio_drafts")).length).toBeGreaterThan(0);
    });

    it("files: .docx only for Studio kinds; old kinds keep their rules", async () => {
      const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const ins = (kind: string, mime: string) => {
        const id = randomUUID();
        const ext = mime === docx ? "docx" : mime === "application/pdf" ? "pdf" : "png";
        return q1(
          "insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, $4, $5, $6, 10, $7)",
          [id, s.familyId, s.learners.nguyen, kind, `${s.familyId}/${s.learners.nguyen}/${id}.${ext}`, mime, s.members.parent],
        );
      };
      await ins("studio_test", docx);
      await ins("studio_key", "application/pdf");
      await fail(ins("answer_key", docx), "23514");
      await fail(ins("studio_test", "image/png"), "23514");
      await ins("answer_key", "image/png");
    });

    it("results: a Studio result may be a practice with a frame; paper-only items need an attempt", async () => {
      await fail(
        q1(
          `insert into english.results(learner_id, mode, context, attempt, source, title, total_items, correct, wrong_items, not_in_app_items, taken_on, recorded_by_member, recorded_role, client_id)
           values ($1, 'quick', 'home', 'first', 'practice', 't', 5, 2, '{1,2}', '{3}', current_date, $2, 'parent', $3)`,
          [s.learners.nguyen, s.members.parent, `r-${randomUUID()}`],
        ),
        "23514",
      );
    });
  });

  // (later tasks add describe blocks here)
});
