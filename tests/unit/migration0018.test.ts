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
});
