import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_tutor_passage_items.sql"))!;
const read = (f: string) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const sql = read(file);
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const squash = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

describe("*_tutor_passage_items.sql (found by suffix)", () => {
  it("is 0040, needs 0039, ends with its version, only replaces eng_tutor_context, never touches public", () => {
    expect(file).toBe("0040_tutor_passage_items.sql");
    expect(code).toContain("s.version = '0039'");
    expect(sql.trim().endsWith(`insert into english.schema_migrations(version) values ('0040') on conflict do nothing;`)).toBe(true);
    expect([...code.matchAll(/create or replace function english\.(\w+)\(/g)].map((m) => m[1])).toEqual(["eng_tutor_context"]);
    expect(code).not.toMatch(/\bpublic\.|create table|alter table|drop /i);
    expect(code).toContain("revoke execute on function english.eng_tutor_context(uuid, uuid, text, text) from public, anon, authenticated;");
    expect(code).toContain("grant execute on function english.eng_tutor_context(uuid, uuid, text, text) to service_role;");
    expect(fnBody(code, "eng_tutor_context")).toMatch(/security definer[\s\S]*set search_path = ''/);
  });

  it("the body = the 0039 body with ONLY the has_passage field added (after 'part')", () => {
    const before = squash(fnBody(read("0039_tutor_hints.sql"), "eng_tutor_context"));
    const now = squash(fnBody(sql, "eng_tutor_context"));
    const from = now.indexOf(squash("'has_passage', exists ("));
    const to = now.indexOf(squash("'answers', coalesce(("));
    expect(from).toBeGreaterThan(now.indexOf(squash("'part', v_part,")));
    expect(now.slice(from, to)).toContain("passage_ref");
    expect(now.slice(0, from) + now.slice(to)).toBe(before);
  });
});
