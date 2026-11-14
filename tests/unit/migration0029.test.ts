import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read("0029_assignment_units.sql");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);

describe("0029_assignment_units.sql", () => {
  it("ends by recording its own version, is expand-only, never touches public, grants narrowly", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0029') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
    expect(code).toContain("alter table english.assignment_units enable row level security;");
    expect(code).toContain("english.eng_forbid_mutation('learner_id')");
    expect(code).not.toMatch(/create or replace function english\.eng_create_assignment\(/);
  });
  it("purge removes every table 0027 removed, plus assignment_units before the curriculum (it points at it) and before assignments", () => {
    const body = fnBody(code, "eng_purge_learner");
    const old = deletes(fnBody(read("0027_points_import.sql"), "eng_purge_learner"));
    const now = deletes(body);
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 1);
    const i = now.indexOf("english.assignment_units");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(now.indexOf("english.curriculum_units"));
    expect(i).toBeLessThan(now.indexOf("english.assignments"));
    expect(body).toContain("'assignment_units', n_assignment_units");
    expect(fnBody(code, "eng_purge_preview")).toContain("'assignment_units'");
  });
});
