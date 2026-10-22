import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0020_level_profile.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));

describe("0020_level_profile.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0020') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("level_decisions and external_results are append-only, staff-read only, and nobody inserts directly", () => {
    for (const t of ["level_decisions", "external_results"]) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_mutation\\s+before update or delete on english\\.${t}\\s+for each row execute function english\\.eng_forbid_mutation\\('learner_id'\\);`));
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_truncate\\s+before truncate on english\\.${t}\\s+for each statement execute function english\\.eng_forbid_mutation\\(\\);`));
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
      expect(code).toContain(`alter table english.${t} enable row level security;`);
    }
    expect(code).toContain("revoke insert, update, delete, truncate on english.level_decisions, english.external_results from public, anon, authenticated, service_role;");
    expect(code).toContain("check (decided_role = 'tutor')");
    expect(code).toContain("supersedes_id uuid references english.external_results(id)");
    expect(code).toContain("create unique index if not exists external_results_superseded_once on english.external_results(supersedes_id) where supersedes_id is not null;");
    expect(code).toContain("constraint level_decisions_adjust_reason check (kind <> 'adjust' or reason is not null)");
  });

  it("files: the kind list only grows (external_result added, nothing removed)", () => {
    expect(code).toContain("check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result'))");
    expect(code).toContain("or kind in ('answer_key', 'work_photo', 'external_result')");
  });

  it("the purge keeps EVERY line of the 0018 version and its preview too; the two books are deleted before files", () => {
    const old18 = readFileSync(path.join(MIGRATIONS_DIR, "0018_reading_skills.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old18, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    expect(purge).toContain("delete from english.level_decisions ld where ld.learner_id = p_learner_id;");
    expect(purge.indexOf("delete from english.external_results er where er.learner_id = p_learner_id;")).toBeGreaterThan(0);
    expect(purge.indexOf("delete from english.external_results")).toBeLessThan(purge.indexOf("delete from english.files fl"));
    expect(purge).toContain("'level_decisions', n_level_decisions,");
    expect(purge).toContain("'external_results', n_external_results,");
    const preview = fnText(sql, "eng_purge_preview");
    expect(preview).toContain("'level_decisions', (select pg_catalog.count(*) from english.level_decisions x where x.learner_id = p_learner),");
    expect(preview).toContain("'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),");
  });

  it("eng_record_level: only the child's active tutor, never level_up, reason for adjust; eng_record_external_result: tutor or parent", () => {
    const lvl = fnText(sql, "eng_record_level");
    expect(lvl).toContain("v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner)");
    for (const tag of ["(tutor_only)", "(level_up_reserved)", "(reason_required)", "(already_confirmed)", "(needs_baseline)", "(same_level)", "(bad_level)"]) {
      expect(lvl, tag).toContain(tag);
    }
    expect(lvl).toContain("for update");
    const ext = fnText(sql, "eng_record_external_result");
    expect(ext).toContain("v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner)");
    expect(ext).toContain("english.eng_register_file(v_l.family_id, p_learner, 'external_result', p_file, p_by)");
    expect(ext).toContain("already_superseded");
    expect(ext).toContain("'external_result.corrected'");
    for (const sig of [
      "eng_record_level(uuid, text, jsonb, text, uuid, text)",
      "eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text, uuid)",
    ]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
  });

  it("every function pins search_path and is security definer; staff reads are service_role only, the student's read authenticated only", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of ["eng_level_profile(uuid)", "eng_recent_level_changes(uuid, int)", "eng_purge_learner(uuid, uuid)", "eng_purge_preview(uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_my_review_by_domain() from public, anon, service_role;");
    expect(code).toContain("grant execute on function english.eng_my_review_by_domain() to authenticated;");
  });

  it("the student's review list returns only a label and a domain, at most 3, and finds the student by auth.uid()", () => {
    const f = fnText(sql, "eng_my_review_by_domain");
    expect(f).toContain("where m.user_id = auth.uid() and m.role = 'student'");
    expect(f).toContain("pg_catalog.jsonb_build_object('domain_key', p.domain_key, 'domain_name', p.domain_name, 'label', p.label)");
    expect(f).toContain("limit 3");
    expect(f).not.toMatch(/to_level|score|'sources'|last_seen|recheck_due_on/);
  });

  it("the profile never returns the source of a reading report", () => {
    expect(fnText(sql, "eng_level_profile")).not.toMatch(/'source'|\.source\b/);
  });

  it("the profile lists only live external results (nobody supersedes them) and shows what a correction replaced", () => {
    const f = fnText(sql, "eng_level_profile");
    expect(f.match(/not exists \(select 1 from english\.external_results s where s\.supersedes_id = (e|x)\.id\)/g)).toHaveLength(2);
    expect(f).toContain("left join english.external_results old on old.id = e.supersedes_id");
  });

});
