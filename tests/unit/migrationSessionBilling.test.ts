import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_session_billing.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);

describe("*_session_billing.sql (found by suffix, U23)", () => {
  it("exists, ends with its own version, is expand-only and never touches public", () => {
    expect(file).toBeTruthy();
    const version = file.slice(0, 4);
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('${version}') on conflict do nothing;`)).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
    expect(code).not.toMatch(/session_month_closes|\bmonth_close/);
    expect(code).not.toMatch(/\b(amount|price|fee|tuition|money)\b/i);
  });
  it("every new function is security definer with an empty search_path", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts).toEqual(expect.arrayContaining(["eng_session_actor", "eng_record_absence", "eng_cancel_absence", "eng_mark_session", "eng_write_lesson_note_v4", "eng_purge_learner", "eng_purge_preview"]));
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/security definer/);
      expect(body, name).toMatch(/set search_path = ''/);
    }
  });
  it("both tables are append-only with a truncate guard, RLS read and no client write", () => {
    for (const t of ["session_absences", "session_marks"]) expect(code).toContain(`'${t}'`);
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("before truncate");
    expect(code).toContain("revoke insert, update, delete, truncate");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
  });
  it("purge removes everything 0029 removed, plus the marks then the absences, all before lesson_notes", () => {
    const old = deletes(fnBody(read("0029_assignment_units.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 2);
    const m = now.indexOf("english.session_marks");
    const a = now.indexOf("english.session_absences");
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(a);
    expect(a).toBeLessThan(now.indexOf("english.lesson_notes"));
    expect(fnBody(code, "eng_purge_learner")).toContain("'session_marks', n_session_marks");
    expect(fnBody(code, "eng_purge_preview")).toContain("'session_absences'");
    // the preview of 0029 keeps every key
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0029_assignment_units.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
  });
});
