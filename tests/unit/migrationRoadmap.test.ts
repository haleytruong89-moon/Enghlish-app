import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_roadmap_milestones.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const deletes = (body: string) => [...body.matchAll(/delete from (english\.\w+)/g)].map((m) => m[1]);

describe("*_roadmap_milestones.sql (found by suffix)", () => {
  it("exists, ends with its own version, is expand-only, never touches public, and is not 0031 (reserved)", () => {
    expect(file).toBeTruthy();
    const version = file.slice(0, 4);
    expect(version).not.toBe("0031");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('${version}') on conflict do nothing;`)).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("every function is security definer with an empty search_path", () => {
    const starts = [...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1]!);
    expect(starts).toEqual(expect.arrayContaining(["eng_roadmap_actor", "eng_roadmap_write", "eng_roadmap_set_main", "eng_roadmap", "eng_my_roadmap", "eng_purge_learner", "eng_purge_preview"]));
    for (const name of starts) {
      const body = fnBody(code, name);
      expect(body, name).toMatch(/security definer/);
      expect(body, name).toMatch(/set search_path = ''/);
    }
  });
  it("the writers are tutor-only and never granted to a client role; the student read is granted to authenticated only", () => {
    expect(fnBody(code, "eng_roadmap_actor")).toMatch(/v_m\.role <> 'tutor'/);
    expect(code).toContain("'eng_roadmap_write(uuid, uuid, int, jsonb, text, text, text, uuid, text)'");
    expect(code).toMatch(/revoke execute on function english\.eng_my_roadmap\(\) from public, anon, service_role;\s+grant execute on function english\.eng_my_roadmap\(\) to authenticated;/);
    expect(code).toMatch(/by_role text not null check \(by_role = 'tutor'\)/);
  });
  it("both tables are append-only with a truncate guard, RLS read and no client write", () => {
    for (const t of ["roadmap_milestones", "roadmap_main_curriculum"]) expect(code).toContain(`'${t}'`);
    expect(code).toContain("english.eng_forbid_mutation(%L)");
    expect(code).toContain("before truncate");
    expect(code).toContain("revoke insert, update, delete, truncate");
    expect(code).toContain("english.eng_is_staff_of(learner_id)");
  });
  it("purge keeps everything 0030 removed, plus the two tables, both before the curricula", () => {
    const old = deletes(fnBody(read("0030_session_billing.sql"), "eng_purge_learner"));
    const now = deletes(fnBody(code, "eng_purge_learner"));
    for (const t of old) expect(now, t).toContain(t);
    expect(now.length).toBe(old.length + 2);
    const curricula = now.indexOf("english.curricula");
    expect(now.indexOf("english.roadmap_milestones")).toBeGreaterThanOrEqual(0);
    expect(now.indexOf("english.roadmap_milestones")).toBeLessThan(curricula);
    expect(now.indexOf("english.roadmap_main_curriculum")).toBeLessThan(curricula);
    const keys = (b: string) => [...b.matchAll(/'(\w+)', \(select/g)].map((x) => x[1]);
    for (const k of keys(fnBody(read("0030_session_billing.sql"), "eng_purge_preview"))) expect(keys(fnBody(code, "eng_purge_preview")), k).toContain(k);
    expect(fnBody(code, "eng_purge_preview")).toContain("'roadmap_milestones'");
  });
});
