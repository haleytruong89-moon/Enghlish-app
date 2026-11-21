import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_tutor_hints.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");
const OLD_PURPOSES = "('studio_extract', 'curriculum_toc', 'read_answers')";
const NEW_PURPOSES = "('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check')";

describe("*_tutor_hints.sql (found by suffix)", () => {
  it("is the next free number, needs 0038, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0039_tutor_hints.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0039') on conflict do nothing;`)).toBe(true);
    expect(code).toContain("s.version = '0038'");
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("every function is security definer with an empty search_path and runs for service_role only", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts.sort()).toEqual([
      "eng_ai_gate", "eng_ai_settings", "eng_log_ai_run", "eng_purge_learner", "eng_purge_preview", "eng_record_tutor_turn", "eng_set_ai_cap", "eng_tutor_context",
    ]);
    for (const name of starts) {
      expect(fnBody(code, name), name).toMatch(/set search_path = ''/);
      expect(fnBody(code, name), name).toMatch(/security definer/);
      expect(code, name).toMatch(new RegExp(`revoke execute on function english\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(code, name).toMatch(new RegExp(`grant execute on function english\\.${name}\\([^)]*\\) to service_role;`));
    }
  });

  it("tutor_turns is append-only with a truncate guard, RLS read for the child's adults only, and a closed list of flags", () => {
    expect(code).toContain("array['tutor_turns']");
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("revoke insert, update, delete, truncate on english.%I from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("child_text text check (child_text is null or pg_catalog.length(child_text) between 1 and 200)");
    for (const f of ["injection_attempt", "off_topic", "frustrated", "asked_answer", "word_meaning"]) expect(code, f).toContain(`'${f}'`);
  });

  it("the AI gate and the run log = the 0027 bodies with ONLY the two new purposes", () => {
    for (const name of ["eng_ai_gate", "eng_log_ai_run"]) {
      const before = squash(fnBody(read("0027_points_import.sql"), name));
      expect(before, name).toContain(squash(OLD_PURPOSES));
      expect(squash(fnBody(sql, name)), name).toBe(before.split(squash(OLD_PURPOSES)).join(squash(NEW_PURPOSES)));
    }
    expect(code).toContain(`check (purpose in ${NEW_PURPOSES})`);
  });

  it("the AI settings read = the 0024 body with ONLY ai_text_version, tutor_today and tutor_month added per learner", () => {
    const before = squash(fnBody(read("0024_studio_b1.sql"), "eng_ai_settings"));
    const body = squash(fnBody(sql, "eng_ai_settings"));
    const from = body.indexOf(squash(",'ai_text_version',"));
    const to = body.indexOf(squash(")order by l.track_id"));
    const added = body.slice(from, to);
    for (const k of ["'tutor_today'", "'tutor_month'", "kind<>'fixed'"]) expect(added, k).toContain(k);
    expect(body.slice(0, from) + body.slice(to)).toBe(before);
  });

  it("the cap goes up to 50 USD: the old ≤ 10 check is dropped by catalog lookup, the setter is parent-only", () => {
    expect(code).toContain("ai_settings_cap_max50 check (monthly_cap_usd > 0 and monthly_cap_usd <= 50)");
    expect(code).toContain("pg_catalog.pg_get_constraintdef(con.oid) ~ 'monthly_cap_usd <= \\(?10'");
    const cap = fnBody(code, "eng_set_ai_cap");
    expect(cap).toContain("role <> 'parent'");
    expect(cap).toContain("bad_cap");
  });

  it("the tutor context checks owner + Studio + practice + not sent before reading answers; the level is counted in the DB under a learner lock", () => {
    const ctx = fnBody(code, "eng_tutor_context");
    expect(ctx.indexOf("not_studio")).toBeLessThan(ctx.indexOf("accepted_additions"));
    expect(ctx.indexOf("test_work")).toBeLessThan(ctx.indexOf("accepted_additions"));
    expect(ctx.indexOf("sent")).toBeLessThan(ctx.indexOf("accepted_additions"));
    const rec = fnBody(code, "eng_record_tutor_turn");
    expect(rec.indexOf("for no key update")).toBeLessThan(rec.indexOf("least(3"));
    expect(rec).toContain("least(3, pg_catalog.count(*)::int + 1)");
  });

  it("purge = the 0037 body with ONLY the tutor_turns delete (before activity_instances) and its receipt key", () => {
    const old = deletes(fnBody(read("0037_studio_feedback_units.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    expect(now.length).toBe(old.length + 1);
    expect(now.indexOf("english.tutor_turns")).toBeLessThan(now.indexOf("english.activity_instances"));
    const before = squash(fnBody(read("0037_studio_feedback_units.sql"), "eng_purge_learner"));
    let body = squash(fnBody(code, "eng_purge_learner"));
    for (const added of [
      "n_tutor_turns int := 0;",
      "delete from english.tutor_turns ttn where ttn.learner_id = p_learner_id; get diagnostics n_tutor_turns = row_count;",
    ]) {
      expect(body, added).toContain(squash(added));
      body = body.replace(squash(added), "");
    }
    const receipt = squash("|| pg_catalog.jsonb_build_object('tutor_turns', n_tutor_turns)");
    expect(body).toContain(receipt);
    expect(body.replace(receipt, "")).toBe(before);
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    const pv = fnBody(code, "eng_purge_preview");
    for (const k of keys(fnBody(read("0037_studio_feedback_units.sql"), "eng_purge_preview"))) expect(keys(pv), k).toContain(k);
    expect(keys(pv)).toContain("tutor_turns");
  });
});
