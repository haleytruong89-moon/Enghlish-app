import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_then_now.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

describe("*_then_now.sql (found by suffix)", () => {
  it("is the next free number, needs 0035, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0036_then_now.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0036') on conflict do nothing;`)).toBe(true);
    expect(code).toContain("s.version = '0035'");
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("every function is security definer with an empty search_path", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts).toEqual(expect.arrayContaining(["eng_pick_then_now", "eng_then_now_candidates", "eng_my_levels", "eng_my_cando", "eng_my_then_now", "eng_purge_learner", "eng_purge_preview"]));
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/set search_path = ''/);
      expect(body, name).toMatch(/security definer/);
    }
  });
  it("the child's reads are for authenticated only; the adult ones for service_role only; helpers for nobody", () => {
    for (const f of ["eng_my_levels()", "eng_my_cando()", "eng_my_then_now()"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, service_role;`);
      expect(code, f).toContain(`grant execute on function english.${f} to authenticated;`);
    }
    for (const f of ["eng_pick_then_now(uuid, uuid, uuid, text, text, uuid, text)", "eng_then_now_candidates(uuid)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated;`);
      expect(code, f).toContain(`grant execute on function english.${f} to service_role;`);
    }
    for (const f of ["eng_attempt_text(uuid)", "eng_pickable_write(uuid, uuid, text)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated, service_role;`);
    }
  });
  it("the table is append-only with a truncate guard, RLS read for the child's adults only, no direct write", () => {
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("before truncate on english.%I");
    expect(code).toContain("revoke insert, update, delete, truncate on english.%I from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("not english.eng_has_score_words(note)");
    expect(code).toContain("by_role = 'tutor'");
  });
  it("the actor is checked before anything else (tutor of this learner; the parent is not a tutor)", () => {
    const body = fnBody(code, "eng_pick_then_now");
    expect(body).toContain("v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner)");
    expect(body.indexOf("eng_actor_may_manage")).toBeLessThan(body.indexOf("from english.then_now_picks"));
  });
  it("the child's reads never mention scores, number levels, flags, proposals or evidence", () => {
    for (const name of ["eng_my_levels", "eng_my_cando", "eng_my_then_now"]) {
      const body = fnBody(code, name);
      expect(body, name).toContain("auth.uid()");
      expect(body, name).not.toMatch(/proposal_decision_id|flag_decision_id|conditions|evidence|assumed|results|auto_checks|score/i);
    }
    expect(fnBody(code, "eng_my_levels")).toContain("dm.scale = 'cefr'");
    expect(fnBody(code, "eng_my_cando")).toContain("md.kind = 'CONFIRMED'");
    expect(fnBody(code, "eng_my_cando")).toContain("pd.kind = 'CONFIRMED'");
  });
  it("purge keeps everything 0035 removed, plus then_now_picks (before attempts)", () => {
    const old = deletes(fnBody(read("0035_weekly_goals.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 1);
    expect(now).toContain("english.then_now_picks");
    expect(now.indexOf("english.then_now_picks")).toBeLessThan(now.indexOf("english.attempts"));
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0035_weekly_goals.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
    expect(fnBody(code, "eng_purge_preview")).toContain("'then_now_picks'");
  });
  it("purge = the 0035 body with ONLY the listed edits", () => {
    const before = squash(fnBody(read("0035_weekly_goals.sql"), "eng_purge_learner"));
    let now = squash(fnBody(code, "eng_purge_learner"));
    for (const added of [
      "n_then_now_picks int := 0;",
      "delete from english.then_now_picks tnp where tnp.learner_id = p_learner_id; get diagnostics n_then_now_picks = row_count;",
      ") || pg_catalog.jsonb_build_object( 'then_now_picks', n_then_now_picks",
    ]) {
      expect(now, added).toContain(squash(added));
      now = now.replace(squash(added), "");
    }
    expect(now).toBe(before);
  });
  it("the purge preview = the 0035 body plus the one key", () => {
    const before = squash(fnBody(read("0035_weekly_goals.sql"), "eng_purge_preview"));
    const now = squash(fnBody(code, "eng_purge_preview"));
    const oldTail = squash("'submission_work_weeks', (select pg_catalog.count(*) from english.submission_work_weeks x where x.learner_id = p_learner)));");
    const newTail = squash("'submission_work_weeks', (select pg_catalog.count(*) from english.submission_work_weeks x where x.learner_id = p_learner)) || pg_catalog.jsonb_build_object('then_now_picks', (select pg_catalog.count(*) from english.then_now_picks x where x.learner_id = p_learner)));");
    expect(before).toContain(oldTail);
    expect(now).toBe(before.replace(oldTail, newTail));
  });
});
