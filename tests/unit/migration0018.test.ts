import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0018_reading_skills.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const json = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as { track: string; group_vi: string; tags: { key: string; label_vi: string }[] };

describe("0018_reading_skills.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0018') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("seeds exactly the two reading JSON files, in order, as group 'Kỹ năng đọc'", () => {
    const expected = [json("reading_A.json"), json("reading_B.json")].flatMap((f) =>
      f.tags.map((t, i) => `('${f.track}', ${i + 1}, '${t.key}', '${t.label_vi.replace(/'/g, "''")}')`));
    for (const row of expected) expect(code).toContain(row);
    const rows = [...code.matchAll(/\('(A|B)', \d+, 'doc-[a-z-]+', '/g)];
    expect(rows.length).toBe(expected.length);
    expect(code).toContain("'Kỹ năng đọc'");
  });

  it("retires A's generic reading tag and seeds the two thresholds", () => {
    expect(code).toMatch(/update english\.error_tags set retired_at = pg_catalog\.clock_timestamp\(\)\s+where track_id = 'A' and key = 'doc-hieu' and retired_at is null;/);
    expect(code).toContain("('reading_min_questions', '4'::jsonb)");
    expect(code).toContain("('reading_weak_pct', '60'::jsonb)");
  });

  it("reading_reports is append-only, staff-read only, and in the purge and its preview", () => {
    expect(code).toContain("create table if not exists english.reading_reports (");
    expect(code).toMatch(/create trigger reading_reports_forbid_mutation\s+before update or delete on english\.reading_reports\s+for each row execute function english\.eng_forbid_mutation\('learner_id'\);/);
    expect(code).toContain("revoke update, delete, truncate on english.reading_reports from public, anon, authenticated, service_role;");
    expect(code).toMatch(/create policy reading_reports_select on english\.reading_reports\s+for select to authenticated\s+using \(english\.eng_is_staff_of\(learner_id\)\);/);
    expect(code).toContain("delete from english.reading_reports rr where rr.learner_id = p_learner_id;");
    expect(code).toContain("'reading_reports', n_reading_reports,");
    expect(code).toContain("'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),");
  });

  it("the purge keeps EVERY line of the 0016 version and the preview every line of the 0017 version (0018 only adds)", () => {
    const fnText = (src: string, name: string) => {
      const start = src.indexOf(`create or replace function english.${name}(`);
      return src.slice(start, src.indexOf("\n$$;", start));
    };
    const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
    const old16 = readFileSync(path.join(MIGRATIONS_DIR, "0016_practice_files.sql"), "utf8");
    const old17 = readFileSync(path.join(MIGRATIONS_DIR, "0017_readiness.sql"), "utf8");
    const nowPurge = new Set(lines(fnText(sql, "eng_purge_learner")));
    for (const l of lines(fnText(old16, "eng_purge_learner"))) expect(nowPurge.has(l), l).toBe(true);
    const nowPreview = new Set(lines(fnText(sql, "eng_purge_preview")));
    for (const l of lines(fnText(old17, "eng_purge_preview"))) expect(nowPreview.has(l), l).toBe(true);
  });

  it("every function pins search_path, is security definer, and is closed to everyone but service_role", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of [
      "eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text)",
      "eng_reading_skills(uuid)",
      "eng_purge_learner(uuid, uuid)",
      "eng_purge_preview(uuid)",
    ]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
  });
});
