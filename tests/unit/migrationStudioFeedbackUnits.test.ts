import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_studio_feedback_units.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

describe("*_studio_feedback_units.sql (found by suffix)", () => {
  it("is the next free number, needs 0036, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0037_studio_feedback_units.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0037') on conflict do nothing;`)).toBe(true);
    expect(code).toContain("s.version = '0036'");
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("every function is security definer with an empty search_path; writers and the adult read are for service_role only", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts.sort()).toEqual(["eng_assign_studio_v3", "eng_my_seen", "eng_purge_learner", "eng_purge_preview", "eng_student_done", "eng_studio_feedback", "eng_write_studio_feedback"]);
    for (const name of starts) {
      expect(fnBody(code, name), name).toMatch(/set search_path = ''/);
      expect(fnBody(code, name), name).toMatch(/security definer/);
    }
    for (const f of ["eng_write_studio_feedback(uuid, text, jsonb, uuid, uuid, text)", "eng_studio_feedback(uuid, uuid)", "eng_assign_studio_v3(uuid, date, date, boolean, uuid, text, jsonb)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated;`);
      expect(code, f).toContain(`grant execute on function english.${f} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_my_seen(timestamptz, uuid, int) from public, anon, service_role;");
    expect(code).toContain("revoke execute on function english.eng_student_done(uuid) from public, anon, authenticated, service_role;");
  });

  it("both tables are append-only with a truncate guard and RLS read for the child's adults only", () => {
    expect(code).toContain("array['studio_feedback', 'studio_assignment_units']");
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("revoke insert, update, delete, truncate on english.%I from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("not english.eng_has_score_words(praise)");
  });

  it("the actor is checked before anything about the work or the Units", () => {
    const fb = fnBody(code, "eng_write_studio_feedback");
    expect(fb.indexOf("eng_actor_may_manage")).toBeLessThan(fb.indexOf("tp.kind = 'studio'"));
    const as = fnBody(code, "eng_assign_studio_v3");
    expect(as.indexOf("eng_actor_may_manage")).toBeLessThan(as.indexOf("bad_units"));
  });

  it("the child's reads = the 0033 bodies with only the Studio-feedback branches added", () => {
    const done0 = squash(fnBody(read("0033_paper_link_submit.sql"), "eng_student_done"));
    const done = squash(fnBody(sql, "eng_student_done"));
    expect(done).toBe(done0.replace(squash("where c.attempt_id = t.id ) x),"), squash("where c.attempt_id = t.id union all select stf.created_at from english.studio_feedback stf where stf.attempt_id = t.id ) x),")));
    const seen = fnBody(code, "eng_my_seen");
    expect(seen).toContain("from english.studio_feedback f");
    expect(seen).not.toMatch(/author|display_name|correct|total_items|results/);
  });

  it("purge = the 0036 body with ONLY the two new deletes (Units before the curricula, feedback before attempts) and receipt keys", () => {
    const old = deletes(fnBody(read("0036_then_now.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    expect(now.length).toBe(old.length + 2);
    expect(now.indexOf("english.studio_assignment_units")).toBeLessThan(now.indexOf("english.curricula"));
    expect(now.indexOf("english.studio_assignment_units")).toBeLessThan(now.indexOf("english.activity_instances"));
    expect(now.indexOf("english.studio_feedback")).toBeLessThan(now.indexOf("english.attempts"));
    const before = squash(fnBody(read("0036_then_now.sql"), "eng_purge_learner"));
    let body = squash(fnBody(code, "eng_purge_learner"));
    for (const added of [
      "n_studio_feedback int := 0; n_studio_assignment_units int := 0;",
      "delete from english.studio_assignment_units sau where sau.learner_id = p_learner_id; get diagnostics n_studio_assignment_units = row_count;",
      "delete from english.studio_feedback stf where stf.learner_id = p_learner_id; get diagnostics n_studio_feedback = row_count;",
      ") || pg_catalog.jsonb_build_object( 'studio_feedback', n_studio_feedback, 'studio_assignment_units', n_studio_assignment_units",
    ]) {
      expect(body, added).toContain(squash(added));
      body = body.replace(squash(added), "");
    }
    expect(body).toBe(before);
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    const pv = fnBody(code, "eng_purge_preview");
    for (const k of keys(fnBody(read("0036_then_now.sql"), "eng_purge_preview"))) expect(keys(pv), k).toContain(k);
    expect(keys(pv)).toEqual(expect.arrayContaining(["studio_feedback", "studio_assignment_units"]));
  });
});
