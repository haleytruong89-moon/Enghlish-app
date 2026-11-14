import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMigrations } from "../../scripts/lib/migrate";
import { createTestDb, migrate, type TestDb } from "./helpers";

const PUBLIC_SNAPSHOT_SQL = `
  select 'rel:' || c.relname || ':' || c.relkind::text as obj
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
  union all
  select 'fn:' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  union all
  select 'pol:' || tablename || ':' || policyname from pg_policies where schemaname = 'public'
  order by 1`;

describe("migrations", () => {
  let db: TestDb;
  let publicBefore: string[];

  beforeAll(async () => {
    db = await createTestDb();
    publicBefore = (await db.client.query<{ obj: string }>(PUBLIC_SNAPSHOT_SQL)).rows.map((r) => r.obj);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("every file ends by recording its own version", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const m of await listMigrations()) {
      const sql = (await readFile(m.file, "utf8")).trim();
      expect(sql.endsWith(
        `insert into english.schema_migrations(version) values ('${m.version}') on conflict do nothing;`,
      )).toBe(true);
    }
  });

  it("apply cleanly on a fresh database", async () => {
    const applied = await migrate(db.client);
    const files = await listMigrations();
    expect(applied).toEqual(files.map((f) => f.version));
    const { rows } = await db.client.query("select version from english.schema_migrations order by 1");
    expect(rows.map((r) => r.version)).toEqual(files.map((f) => f.version));
  });

  it("db-apply is a no-op when everything is applied", async () => {
    expect(await migrate(db.client)).toEqual([]);
  });

  it("re-running every file is idempotent (second full apply)", async () => {
    const files = await listMigrations();
    expect(await migrate(db.client, true)).toEqual(files.map((f) => f.version));
    const { rows } = await db.client.query("select count(*)::int as n from english.schema_migrations");
    expect(rows[0].n).toBe(files.length);
  });

  it("creates nothing in schema public (Launcher stub untouched)", async () => {
    const after = (await db.client.query<{ obj: string }>(PUBLIC_SNAPSHOT_SQL)).rows.map((r) => r.obj);
    expect(after).toEqual(publicBefore);
    // Launcher objects with the same names still exist side by side.
    const { rows } = await db.client.query(`
      select to_regclass('public.families') is not null as pf,
             to_regclass('english.families') is not null as ef,
             to_regclass('public.audit_log') is not null as pa,
             to_regclass('english.audit_log') is not null as ea,
             to_regprocedure('public.auth_role()') is not null as pr`);
    expect(rows[0]).toEqual({ pf: true, ef: true, pa: true, ea: true, pr: true });
  });

  it("all helper functions live in english and are prefixed eng_", async () => {
    const { rows } = await db.client.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'english'`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.proname.startsWith("eng_")).toBe(true);
  });

  it("RLS is enabled on every english table", async () => {
    const { rows } = await db.client.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'english' and c.relkind = 'r'`);
    expect(rows.map((r) => r.relname).sort()).toEqual(
      [
        "accepted_additions", "activity_instance_events", "activity_instances", "activity_templates", "aggregate_indicators",
        "ai_runs", "ai_settings", "app_errors", "app_feedback", "app_feedback_events", "artifact_versions", "assessment_policies", "assignment_events", "assignment_units", "assignments", "assistance_events", "attempt_auto_checks",
        "attempts", "audit_log", "catalogue_versions", "competency_state", "consents", "curricula", "curriculum_unit_events", "curriculum_unit_points", "curriculum_units", "curriculum_versions", "dimensions", "engine_policy_map", "episode_marks", "episodes", "error_tags", "exposure_log", "external_results",
        "families", "feedback_notes", "files", "import_batches", "inquiry_instances", "inquiry_templates", "instance_item_keys", "item_decisions", "learner_intake", "learners", "lesson_note_units", "lesson_notes", "level_decisions", "login_names", "mastery_decisions", "members",
        "observations", "point_decisions", "point_policies", "point_state", "reading_reports", "recheck_events", "relationships", "results", "revision_checks", "revision_marks", "schema_migrations", "session_absences", "session_marks", "skill_domains", "skill_groups", "skill_leaves", "skill_maps", "source_transcripts", "sources", "studio_drafts", "studio_item_meta", "submissions", "tag_marks",
        "target_set_definitions", "target_sets", "targets", "teaching_notes", "template_item_keys", "template_step_sources", "test_frames", "track_settings", "tracks", "tutorwork_settings", "upload_tickets",
        "validation_decisions", "working_drafts",
      ],
    );
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it("anon has no privilege on the schema, any table or any function", async () => {
    const { rows } = await db.client.query(`
      select
        has_schema_privilege('anon', 'english', 'usage') as schema_usage,
        (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'english' and c.relkind in ('r','v','S')
            and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate'))) as tables,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'english' and has_function_privilege('anon', p.oid, 'execute')) as functions`);
    expect(rows[0]).toEqual({ schema_usage: false, tables: 0, functions: 0 });
  });

  it("authenticated only has SELECT, and only on the readable tables", async () => {
    const { rows } = await db.client.query<{ relname: string; s: boolean; w: boolean }>(`
      select c.relname,
        has_table_privilege('authenticated', c.oid, 'select') as s,
        has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate') as w
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'english' and c.relkind = 'r' order by 1`);
    const readable = rows.filter((r) => r.s).map((r) => r.relname);
    expect(readable).toEqual([
      "accepted_additions", "activity_instance_events", "activity_instances", "activity_templates", "aggregate_indicators",
      "app_feedback", "app_feedback_events", "artifact_versions", "assessment_policies", "assignment_events", "assignment_units", "assignments", "assistance_events", "attempt_auto_checks", "attempts",
      "audit_log", "catalogue_versions", "competency_state", "consents", "curricula", "curriculum_unit_events", "curriculum_unit_points", "curriculum_units", "curriculum_versions", "dimensions", "episode_marks", "episodes", "error_tags", "exposure_log", "external_results", "families", "feedback_notes", "files",
      "import_batches", "inquiry_instances", "inquiry_templates", "instance_item_keys", "item_decisions", "learner_intake", "learners", "lesson_note_units", "lesson_notes", "level_decisions", "mastery_decisions", "members", "observations",
      "point_decisions", "point_state", "reading_reports", "recheck_events", "relationships", "results", "revision_checks", "revision_marks", "session_absences", "session_marks", "skill_domains", "skill_groups", "skill_leaves", "skill_maps", "source_transcripts", "sources", "studio_drafts", "studio_item_meta", "submissions", "tag_marks", "target_set_definitions",
      "target_sets", "targets", "teaching_notes", "template_item_keys", "template_step_sources", "test_frames", "tracks", "validation_decisions",
      "working_drafts",
    ]);
    expect(rows.some((r) => r.w)).toBe(false);
  });
});
