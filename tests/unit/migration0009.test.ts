import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

/** The text of `create or replace function english.eng_purge_learner(…)` up to its closing grant. */
function purgeFunction(sql: string): string[] {
  const start = sql.indexOf("create or replace function english.eng_purge_learner(");
  const endMarker = "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;";
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("eng_purge_learner not found");
  return sql.slice(start, end + endMarker.length).split("\n");
}

describe("0009_student_work.sql", () => {
  const sql = read("0009_student_work.sql");

  it("eng_purge_learner keeps EVERY line of the 0007 version (0009 only adds) and deletes the S4 tables before the S2 ones", () => {
    const old = purgeFunction(read("0007_inquiries.sql"));
    const now = purgeFunction(sql);
    // `old` must be a subsequence of `now`: nothing was lost, lines were only added
    let i = 0;
    for (const line of now) if (i < old.length && line === old[i]) i++;
    expect(i, `lost line: ${old[i]}`).toBe(old.length);
    expect(now.length).toBeGreaterThan(old.length);

    const body = now.join("\n");
    const order = [
      "attempt_auto_checks",
      "episodes",
      "exposure_log",
      "assistance_events",
      "artifact_versions",
      "attempts",
      "working_drafts",
      "activity_instance_events",
      "instance_item_keys",
      "activity_instances",
      "inquiry_instances",
      "target_sets",
      "audit_log",
    ].map((t) => body.indexOf(`delete from english.${t} `));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // children before parents, learners last
  });

  it("is idempotent and house-style: no grant on all tables, nothing in public, ends with its schema_migrations row", () => {
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/on all tables/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/supabase db push/i);
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0009') on conflict do nothing;")).toBe(true);
    for (const m of sql.matchAll(/create table (?:if not exists )?(english\.\w+)/g)) {
      expect(sql, m[0]).toContain(`create table if not exists ${m[1]}`);
      expect(sql, `RLS on ${m[1]}`).toContain(`alter table ${m[1]} enable row level security`);
    }
  });

  it("every function is security definer with an empty search_path; students may run only the eng_my_* reads and the two writes", () => {
    const defs = sql.match(/create or replace function english\.\w+\([\s\S]*?\n\$\$;/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(8);
    for (const d of defs) {
      if (/security definer/.test(d)) expect(d, d.slice(0, 80)).toMatch(/set search_path = ''/);
    }
    for (const fn of ["eng_my_inquiries()", "eng_my_home()", "eng_my_activity(uuid)", "eng_my_step_sources(uuid)"]) {
      expect(sql).toContain(`grant execute on function english.${fn} to authenticated;`);
    }
    // nothing is ever granted to anon or PUBLIC
    expect(sql).not.toMatch(/grant execute on function [^;]* to (anon|public)\b/i);
  });

  it("replaces eng_my_released_steps (0007) with a version that names no skill code, purpose or answer, and keeps its grants", () => {
    const start = sql.indexOf("create or replace function english.eng_my_released_steps(");
    expect(start).toBeGreaterThan(0);
    const end = sql.indexOf("\n$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/security definer set search_path = ''/);
    for (const bad of ["target_id", "'purpose'", "a.purpose", "answer", "explanation", "prompt_vi", "review_note", "transcript"]) {
      expect(body, bad).not.toContain(bad);
    }
    expect(body).toContain("eng_step_supported");
    expect(sql).toContain("revoke execute on function english.eng_my_released_steps(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function english.eng_my_released_steps(uuid) to authenticated;");
  });

  it("the free-text normaliser cleans NFC, non-breaking and zero-width characters, curly quotes and trailing . ! ? (one place, used for both sides)", () => {
    const start = sql.indexOf("create or replace function english.eng_clean_text(");
    const end = sql.indexOf("create or replace function english.eng_step_shape(");
    const body = sql.slice(start, end);
    for (const needle of ["nfc", "\\u00A0", "\\u202F", "\\u200B-\\u200D\\uFEFF", "\\u2018\\u2019", "\\u201C\\u201D", "[.!?]+", "pg_catalog.lower"]) {
      expect(body, needle).toContain(needle);
    }
    expect(sql).toContain("regexp_split_to_table(english.eng_clean_text(v_key), ' / ')");
  });

  it("the learner tables are append-only (trigger + truncate trigger) and only working_drafts is mutable", () => {
    for (const t of ["attempts", "artifact_versions", "assistance_events", "exposure_log", "episodes", "attempt_auto_checks"]) {
      expect(sql, t).toMatch(new RegExp(`'${t}'`));
    }
    expect(sql).toContain("execute function english.eng_forbid_mutation(%L)");
    expect(sql).toContain("before truncate");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/forbid_mutation[^\n]*working_drafts/);
  });
});
