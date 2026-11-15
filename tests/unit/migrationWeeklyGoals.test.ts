import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_weekly_goals.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

describe("*_weekly_goals.sql (found by suffix)", () => {
  it("is the next free number, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0035_weekly_goals.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0035') on conflict do nothing;`)).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("Q5 = (i): no minute logging anywhere (no work_minutes table, no minute goal)", () => {
    expect(code).not.toMatch(/work_minutes|minutes|\bmin_goal|goal_minutes/i);
  });
  it("every function is security definer with an empty search_path (the week helper is a plain stable sql function with an empty path)", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts.length).toBeGreaterThanOrEqual(9);
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/set search_path = ''/);
      if (name !== "eng_week_start") expect(body, name).toMatch(/security definer/);
    }
  });
  it("the child's functions are for authenticated only; the adult ones for service_role only; internals for nobody", () => {
    for (const f of ["eng_my_propose_goal(int, text)", "eng_my_withdraw_goal(uuid, text)", "eng_my_week()"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, service_role;`);
      expect(code, f).toContain(`grant execute on function english.${f} to authenticated;`);
    }
    for (const f of ["eng_decide_goal(uuid, text, int, uuid, text)", "eng_week_facts(uuid)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated;`);
      expect(code, f).toContain(`grant execute on function english.${f} to service_role;`);
    }
    for (const f of ["eng_week_start(timestamptz)", "eng_week_work(uuid)", "eng_week_facts_of(uuid)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated, service_role;`);
    }
  });
  it("the ledger is append-only with a truncate guard, RLS read for the child's adults only, no direct write; one answer per proposal", () => {
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("before truncate on english.%I");
    expect(code).toContain("revoke insert, update, delete, truncate on english.%I from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("create unique index if not exists weekly_goals_one_answer on english.weekly_goals(responds_to)");
  });
  it("the start of a decision is set by the function (no parameter for it) and is next Monday in Vietnam", () => {
    const body = fnBody(code, "eng_decide_goal");
    expect(code).toContain("create or replace function english.eng_decide_goal(p_goal uuid, p_action text, p_pieces int, p_by uuid, p_client_id text)");
    expect(body).toContain("v_from := english.eng_week_start(pg_catalog.now()) + 7;");
    expect(code).toContain("date_trunc('week', p_at at time zone 'Asia/Ho_Chi_Minh')");
  });
  it("the actor is checked before anything else in the decision (the 2B lesson), and the parent is not a tutor", () => {
    const body = fnBody(code, "eng_decide_goal");
    expect(body.indexOf("v_m.role <> 'tutor'")).toBeGreaterThan(0);
    expect(body.indexOf("v_m.role <> 'tutor'")).toBeLessThan(body.indexOf("select * into v_g"));
    expect(body.indexOf("eng_actor_may_manage")).toBeLessThan(body.indexOf("select * into v_old"));
  });
  it("the work facts count only the child's own submissions and the paper an adult sent for the child", () => {
    const body = fnBody(code, "eng_week_work");
    expect(body).toContain("t.provenance in ('in_app', 'pasted')");
    expect(body).toContain("tp.kind in ('topic', 'studio')");
    expect(body).toContain("(s.submitted_by_role = 'student' or g.kind <> 'link')");
    expect(body).not.toMatch(/tutor_live|manual_import|imported|working_drafts|item_retries/);
  });
  it("purge keeps everything 0034 removed, plus weekly_goals", () => {
    const old = deletes(fnBody(read("0034_result_view_retry.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 1);
    expect(now).toContain("english.weekly_goals");
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0034_result_view_retry.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
    expect(fnBody(code, "eng_purge_preview")).toContain("'weekly_goals'");
  });
  it("purge = the 0034 body with ONLY the listed edits", () => {
    const before = squash(fnBody(read("0034_result_view_retry.sql"), "eng_purge_learner"));
    let now = squash(fnBody(code, "eng_purge_learner"));
    for (const added of [
      "n_weekly_goals int := 0;",
      "delete from english.weekly_goals wg where wg.learner_id = p_learner_id; get diagnostics n_weekly_goals = row_count;",
      ") || pg_catalog.jsonb_build_object( 'weekly_goals', n_weekly_goals",
    ]) {
      expect(now, added).toContain(squash(added));
      now = now.replace(squash(added), "");
    }
    expect(now).toBe(before);
  });
  it("the purge preview = the 0034 body plus the one key", () => {
    const before = squash(fnBody(read("0034_result_view_retry.sql"), "eng_purge_preview"));
    const now = squash(fnBody(code, "eng_purge_preview"));
    const oldTail = squash("'work_test_marks', (select pg_catalog.count(*) from english.work_test_marks x where x.learner_id = p_learner)));");
    const newTail = squash("'work_test_marks', (select pg_catalog.count(*) from english.work_test_marks x where x.learner_id = p_learner)) || pg_catalog.jsonb_build_object('weekly_goals', (select pg_catalog.count(*) from english.weekly_goals x where x.learner_id = p_learner)));");
    expect(before).toContain(oldTail);
    expect(now).toBe(before.replace(oldTail, newTail));
  });
});
