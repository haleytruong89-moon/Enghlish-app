import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0026_curriculum.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const NEW_TABLES = ["curricula", "curriculum_versions", "curriculum_units", "curriculum_unit_points", "curriculum_unit_events", "lesson_note_units"];

describe("0026_curriculum.sql", () => {
  it("ends by recording its own version, is expand-only, never touches schema public, grants table by table", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0026') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    // the only drops: the old signatures of the two AI functions that get a trailing p_purpose
    expect([...code.matchAll(/drop\s+function\s+if\s+exists\s+english\.(\w+)/gi)].map((m) => m[1]).sort()).toEqual(["eng_ai_gate", "eng_log_ai_run"]);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("new tables: RLS on, read through eng_is_staff_of, no direct writes; the old lesson-note functions are not redefined", () => {
    for (const t of NEW_TABLES) expect(code, t).toContain(`alter table english.${t} enable row level security;`);
    expect(code).toContain("create policy %I on english.%I for select to authenticated using (english.eng_is_staff_of(learner_id))");
    expect(code).not.toMatch(/create or replace function english\.eng_write_lesson_note(_v2)?\(/);
    expect(code).toMatch(/create or replace function english\.eng_write_lesson_note_v3\(/);
  });
  it("approving is tutor-only in the database too (D-W8)", () => {
    const start = code.indexOf("create or replace function english.eng_approve_curriculum_version(");
    const body = code.slice(start, code.indexOf("\n$$;", start));
    expect(body).toMatch(/v_m\.role <> 'tutor'/);
    expect(body).toContain("(tutor_only)");
  });
});
