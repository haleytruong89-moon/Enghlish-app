import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_result_view_retry.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

describe("*_result_view_retry.sql (found by suffix)", () => {
  it("is the next free number, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0034_result_view_retry.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0034') on conflict do nothing;`)).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("every function is security definer with an empty search_path", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts.length).toBeGreaterThanOrEqual(10);
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/security definer/);
      expect(body, name).toMatch(/set search_path = ''/);
    }
  });
  it("child functions are for authenticated only; adult writers / readers for service_role only; old studio review is revoked from everyone", () => {
    for (const f of ["eng_my_result_view(uuid)", "eng_my_retry_item(uuid, text, text, text)", "eng_my_test_marks()"]) {
      const name = f.split("(")[0]!;
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, service_role;`);
      expect(code, f).toContain(`grant execute on function english.${f} to authenticated;`);
      expect(code).not.toMatch(new RegExp(`grant execute on function english\\.${name}\\([^)]*\\) to service_role`));
    }
    for (const f of ["eng_set_test_mark(text, uuid, boolean, uuid, text)", "eng_assign_studio_v2(uuid, date, date, boolean, uuid, text)", "eng_item_retries(uuid)", "eng_retry_pending(uuid, boolean)", "eng_mark_retry_seen(uuid, text, uuid, text)"]) {
      expect(code, f).toContain(`revoke execute on function english.${f} from public, anon, authenticated;`);
      expect(code, f).toContain(`grant execute on function english.${f} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_my_studio_review(uuid) from public, anon, authenticated, service_role;");
    expect(code).not.toMatch(/grant execute on function english\.eng_my_studio_review/);
  });
  it("both tables are append-only with a truncate guard, RLS read for the child's adults and no direct write", () => {
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("before truncate on english.%I");
    expect(code).toContain("revoke insert, update, delete, truncate on english.%I from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("unique (attempt_id, item_id)");
  });
  it("the result view never selects a key, an explanation or a count of right items", () => {
    const body = fnBody(code, "eng_my_result_view");
    expect(body).not.toMatch(/instance_item_keys|explanation|template_item_keys|count\(/);
  });
  it("the retry function never reads like evidence: no write to the engine / evidence tables", () => {
    const body = fnBody(code, "eng_my_retry_item");
    expect(body).not.toMatch(/insert into english\.(attempts|artifact_versions|episodes|exposure_log|results|tag_marks)/);
  });
  it("purge keeps everything 0033 removed, plus the three tables, before attempts / submissions / assignments / activity_instances", () => {
    const old = deletes(fnBody(read("0033_paper_link_submit.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 3);
    for (const t of ["english.retry_seen", "english.item_retries", "english.work_test_marks"]) {
      for (const parent of ["english.attempts", "english.submissions", "english.assignments", "english.activity_instances"]) {
        expect(now.indexOf(t), `${t} before ${parent}`).toBeLessThan(now.indexOf(parent));
      }
    }
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0033_paper_link_submit.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
    expect(fnBody(code, "eng_purge_preview")).toContain("'item_retries'");
    expect(fnBody(code, "eng_purge_preview")).toContain("'retry_seen'");
    expect(fnBody(code, "eng_purge_preview")).toContain("'work_test_marks'");
  });
  it("purge = the 0033 body with ONLY the listed edits", () => {
    const before = squash(fnBody(read("0033_paper_link_submit.sql"), "eng_purge_learner"));
    let now = squash(fnBody(code, "eng_purge_learner"));
    for (const added of [
      "n_item_retries int := 0; n_retry_seen int := 0; n_work_test_marks int := 0;",
      "delete from english.retry_seen rs where rs.learner_id = p_learner_id; get diagnostics n_retry_seen = row_count; delete from english.item_retries ir where ir.learner_id = p_learner_id; get diagnostics n_item_retries = row_count; delete from english.work_test_marks wtm where wtm.learner_id = p_learner_id; get diagnostics n_work_test_marks = row_count;",
      "|| pg_catalog.jsonb_build_object( 'item_retries', n_item_retries, 'retry_seen', n_retry_seen, 'work_test_marks', n_work_test_marks )",
    ]) {
      expect(now, added).toContain(squash(added));
      now = now.replace(squash(added), "");
    }
    expect(now).toBe(before);
  });
});
