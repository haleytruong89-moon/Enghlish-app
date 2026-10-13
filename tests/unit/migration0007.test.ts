import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

/** The text of `create or replace function english.eng_purge_learner(…)` up to its closing grant. */
function purgeFunction(sql: string): string[] {
  const start = sql.indexOf("create or replace function english.eng_purge_learner(");
  const endMarker = "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;";
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("eng_purge_learner not found");
  return sql.slice(start, end + endMarker.length).split("\n");
}

describe("0007_inquiries.sql", () => {
  const sql = read("0007_inquiries.sql");

  it("eng_purge_learner keeps EVERY line of the 0005 version (0007 only adds deletes) and now deletes the S2 tables first", () => {
    const old = purgeFunction(read("0005_config.sql"));
    const now = purgeFunction(sql);
    // `old` must be a subsequence of `now`
    let i = 0;
    for (const line of now) if (i < old.length && line === old[i]) i++;
    expect(i, `lost line: ${old[i]}`).toBe(old.length);
    expect(now.length).toBeGreaterThan(old.length);

    const body = now.join("\n");
    const order = ["activity_instance_events", "instance_item_keys", "activity_instances", "inquiry_instances", "target_sets", "audit_log"].map(
      (t) => body.indexOf(`delete from english.${t} `),
    );
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // children before parents, learners last
  });

  it("is idempotent and house-style: no grant on all tables, nothing in public, ends with its schema_migrations row", () => {
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/on all tables/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/supabase db push/i);
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0007') on conflict do nothing;")).toBe(true);
    for (const m of sql.matchAll(/create table (?:if not exists )?(english\.\w+)/g)) {
      expect(sql, m[0]).toContain(`create table if not exists ${m[1]}`);
      expect(sql, `RLS on ${m[1]}`).toContain(`alter table ${m[1]} enable row level security`);
    }
  });

  it("every function that writes is security definer with an empty search_path and only the service role may run it", () => {
    for (const fn of ["eng_assign_inquiry(uuid, text, int, date, uuid, text)", "eng_activity_event(uuid, text, date, text, uuid)"]) {
      expect(sql).toContain(`revoke execute on function english.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function english.${fn} to service_role;`);
    }
    // the one function a student may call: authenticated only, never anon/public
    expect(sql).toContain("revoke execute on function english.eng_my_released_steps(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function english.eng_my_released_steps(uuid) to authenticated;");
    const defs = sql.match(/create or replace function english\.\w+\([\s\S]*?\n\$\$;/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(8);
    for (const d of defs) {
      if (/security definer/.test(d)) expect(d, d.slice(0, 80)).toMatch(/set search_path = ''/);
    }
  });
});
