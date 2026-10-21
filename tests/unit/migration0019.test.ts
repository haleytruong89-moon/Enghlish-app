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
});
