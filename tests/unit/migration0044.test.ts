import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("db/migrations/0044_unit_progress_auto.sql", "utf8");

describe("migration 0044 (L2) is additive and closed", () => {
  it("needs 0043, adds functions only, ends by recording itself", () => {
    expect(sql).toMatch(/missing_0043/);
    expect(sql).not.toMatch(/create table|alter table|drop table/i);
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0044') on conflict do nothing;")).toBe(true);
  });
  it("the inner function is nobody's to call; the adults' read checks staff; the child's read stays authenticated only", () => {
    expect(sql).toMatch(/revoke execute on function english\.eng_unit_auto_events\(uuid\) from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/where english\.eng_is_staff_of\(p_learner\)/);
    expect(sql).toMatch(/revoke execute on function english\.eng_my_roadmap\(\) from public, anon, service_role;\s+grant execute on function english\.eng_my_roadmap\(\) to authenticated;/);
  });
  it("the title rule is the one of lib/results/score.ts unitKeyOf (Reviews / Progress Tests / ranges left out)", () => {
    expect(sql).toContain(String.raw`'\munits?\s*(\d{1,2})\y(?!\s*[–-]\s*\d)'`);
    expect(sql).toContain(String.raw`!~ '\mreview\s*\d'`);
    expect(sql).toContain(String.raw`!~ '\mprogress test\s*\d'`);
  });
});
