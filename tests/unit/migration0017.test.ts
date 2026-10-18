import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0017_readiness.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("0017_readiness.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0017') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("every function pins search_path and is closed to anon / authenticated (service_role only)", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    expect(code).toContain("revoke execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[]) from public, anon, authenticated;");
    expect(code).toContain("grant execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[]) to service_role;");
  });

  it("step 1: the v2 lesson note replaces the 10-argument version and logs 'lesson' exposures", () => {
    expect(code).toContain("drop function if exists english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text);");
    expect(code).toMatch(/insert into english\.exposure_log\(learner_id, target_key, at, source, attempt_id, lesson_note_id\)\s+select p_learner, k, english\.eng_session_ts\(p_session_date\), 'lesson'/);
  });

  it("step 2: the quick-result duplicate rule covers only entries without an assignment or a frame, and lets a correction through", () => {
    const fn = code.slice(code.indexOf("create or replace function english.eng_record_result("));
    expect(fn).toContain("p_mode = 'quick' and p_attempt = 'first' and p_assignment is null");
    expect(fn).toContain("r2.mode = 'quick' and r2.attempt = 'first' and r2.assignment_id is null");
    expect(fn).toContain("r2.id is distinct from p_supersedes");
    expect(fn).toContain("(duplicate_first)");
  });
});
