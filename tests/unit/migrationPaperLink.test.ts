import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_paper_link_submit.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);

describe("*_paper_link_submit.sql (found by suffix)", () => {
  it("is the next free number, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBe("0033_paper_link_submit.sql");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0033') on conflict do nothing;`)).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("every function is security definer with an empty search_path", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts).toEqual(
      expect.arrayContaining(["eng_submit_practice_v2", "eng_write_submission_feedback", "eng_submission_feedback", "eng_student_done", "eng_my_seen", "eng_my_practice", "eng_purge_learner", "eng_purge_preview"]),
    );
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/security definer/);
      expect(body, name).toMatch(/set search_path = ''/);
    }
  });
  it("the writers are for service_role only; the child reads for authenticated only", () => {
    expect(code).toMatch(/revoke execute on function english\.eng_submit_practice_v2\(uuid, uuid, text, text, boolean, text, jsonb\) from public, anon, authenticated;\s+grant execute on function english\.eng_submit_practice_v2\([^)]*\) to service_role;/);
    expect(code).toMatch(/revoke execute on function english\.eng_write_submission_feedback\([^)]*\) from public, anon, authenticated;\s+grant execute on function english\.eng_write_submission_feedback\([^)]*\) to service_role;/);
    expect(code).toMatch(/revoke execute on function english\.eng_my_seen\([^)]*\) from public, anon, service_role;\s+grant execute on function english\.eng_my_seen\([^)]*\) to authenticated;/);
  });
  it("submission_feedback is append-only with a truncate guard, RLS read for the child's adults and no client write", () => {
    expect(code).toContain("english.eng_forbid_mutation('learner_id')");
    expect(code).toContain("before truncate on english.submission_feedback");
    expect(code).toContain("revoke insert, update, delete, truncate on english.submission_feedback from service_role");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
    expect(code).toContain("eng_has_score_words");
  });
  it("v1 stays as it was: the old submit function is not redefined", () => {
    expect(code).not.toMatch(/create or replace function english\.eng_submit_practice\(/);
    expect(code).not.toMatch(/eng_assignment_overview/);
  });
  it("the child reads never return a score, a result, the author or the tags of a submission", () => {
    const body = fnBody(code, "eng_my_seen");
    expect(body).not.toMatch(/author_/);
    expect(body).not.toMatch(/'(score|correct|wrong|tag)/i);
  });
  it("purge keeps everything 0031 removed, plus submission_feedback, before submissions", () => {
    const old = deletes(fnBody(read("0031_roadmap_milestones.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 1);
    expect(now.indexOf("english.submission_feedback")).toBeGreaterThanOrEqual(0);
    expect(now.indexOf("english.submission_feedback")).toBeLessThan(now.indexOf("english.submissions"));
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0031_roadmap_milestones.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
    expect(fnBody(code, "eng_purge_preview")).toContain("'submission_feedback'");
  });
});
