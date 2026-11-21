import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_my_task_parts.sql"))!;
const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("*_my_task_parts.sql (E0, found by suffix)", () => {
  it("is 0038, needs 0037, ends with its version, only adds one read function and never touches public", () => {
    expect(file).toBe("0038_my_task_parts.sql");
    expect(code).toContain("s.version = '0037'");
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0038') on conflict do nothing;")).toBe(true);
    expect([...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1])).toEqual(["eng_my_task_parts"]);
    expect(code).not.toMatch(/create table|alter table|drop |\bpublic\.|insert into english\.(?!schema_migrations)|update english\./i);
  });
  it("the child's read: auth.uid(), security definer, empty search_path, authenticated only; never keys, answers, tags or explanations", () => {
    expect(code).toContain("auth.uid()");
    expect(code).toMatch(/security definer set search_path = ''/);
    expect(code).toContain("revoke execute on function english.eng_my_task_parts(uuid) from public, anon, service_role;");
    expect(code).toContain("grant execute on function english.eng_my_task_parts(uuid) to authenticated;");
    expect(code).not.toMatch(/'key', x|->> 'key'\s*,|accepted|explanation|tag_key|keys|instance_item_keys|template_item_keys/);
  });
});
