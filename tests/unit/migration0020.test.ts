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

  // (Tasks 2 and 3 add their tests here)
});
