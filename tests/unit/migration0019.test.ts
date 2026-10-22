import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, sourceHash } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0019_skill_map.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fileText = readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8");
const TABLES = ["skill_maps", "skill_domains", "skill_groups", "skill_leaves"];

describe("0019_skill_map.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0019') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("seeds SM-1 exactly as content/skill_map/SM-1.json, with its sha256, and publishes it once", () => {
    const m = /\$j\$([\s\S]*?)\$j\$::jsonb/.exec(sql);
    expect(m, "embedded JSON").not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(JSON.parse(fileText));
    expect(sql.match(/\$j\$/g)).toHaveLength(2);
    expect(code).toContain(`v_hash constant text := '${sourceHash(JSON.parse(fileText))}';`);
    expect(code).toContain("if exists (select 1 from english.skill_maps m where m.id = j ->> 'id' and m.published_at is not null) then");
    expect(code).toMatch(/update english\.skill_maps set published_at = pg_catalog\.now\(\)\s+where id = j ->> 'id' and published_at is null;/);
  });

  it("the four tables are versioned configuration: immutable once published, never truncated, RLS on, read-only for members", () => {
    for (const t of TABLES) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toContain(`alter table english.${t} enable row level security;`);
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated`));
    }
    expect(code).toMatch(/create trigger skill_maps_immutable\s+before update or delete on english\.skill_maps\s+for each row execute function english\.eng_forbid_published_change\('self'\);/);
    expect(code).toContain("foreach t in array array['skill_domains', 'skill_groups', 'skill_leaves'] loop");
    expect(code).toContain("'create trigger %I before insert or update or delete on english.%I for each row execute function english.eng_forbid_skill_map_change()'");
    expect(code).toContain("foreach t in array array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves'] loop");
    expect(code).toContain("grant select on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves to authenticated;");
    expect(code).toContain(
      "revoke insert, update, delete, truncate on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from public, anon, authenticated, service_role;",
    );
    expect(code).toContain("revoke all on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from anon;");
    expect(code).toContain("revoke execute on function english.eng_forbid_skill_map_change() from public, anon, authenticated;");
  });

  it("the seed checks every leaf against the catalogue, the seed tags and its domain's scale before publishing", () => {
    expect(code).toContain("0019: SM-1 names a catalogue skill that does not exist");
    expect(code).toContain("0019: SM-1 names a seed tag that does not exist");
    expect(code).toContain("0019: a leaf uses the other scale than its domain");
  });

  it("error_tags.group_key is a nullable column (expand) that only family tags may fill, with the group-key shape", () => {
    expect(code).toContain("alter table english.error_tags add column if not exists group_key text;");
    expect(code).toContain("check (group_key is null or (origin = 'custom' and group_key ~ '^[a-z]{2}-[a-z-]{2,30}$'))");
  });

  it("keeps eng_add_error_tag of 0014 untouched (expand) and adds v2, set-group and the read function", () => {
    expect(code).not.toContain("function english.eng_add_error_tag(");
    for (const f of ["eng_current_skill_map(", "eng_add_error_tag_v2(", "eng_set_tag_group(", "eng_skill_map("]) {
      expect(code).toContain(`create or replace function english.${f}`);
    }
    expect(code).toContain("(unknown_group)");
    expect(code).toContain("(already_grouped)");
    expect(code).toContain("'error_tag.grouped'");
  });

  it("every function pins search_path; callable ones are security definer and closed to everyone but service_role", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      if (!/returns trigger/.test(m[0])) expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of ["eng_add_error_tag_v2(uuid, text, text, text, uuid)", "eng_set_tag_group(uuid, text, text, uuid)", "eng_skill_map(uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_current_skill_map() from public, anon, authenticated, service_role;");
  });
});
