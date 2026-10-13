import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContentItems, readLock } from "@/lib/config/versions";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import {
  ACTIVITY_TRACKS,
  buildSeedSql,
  dollarQuote,
  jsonLiteral,
  quoteLiteral,
  SEED_MIGRATION_FILE,
} from "../../scripts/lib/configSql";

describe("SQL escaping", () => {
  it("quoteLiteral doubles single quotes and never lets text escape the literal", () => {
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral("'; drop table x; --")).toBe("'''; drop table x; --'");
    expect(quoteLiteral("a\\b'c")).toBe("E'a\\\\b''c'");
  });

  it("dollarQuote picks a tag that is not in the text", () => {
    expect(dollarQuote("plain")).toBe("$j$plain$j$");
    const nasty = "x $j$ y $j1$ z $$ ' end";
    const q = dollarQuote(nasty);
    expect(q).toBe(`$j2$${nasty}$j2$`);
    expect(q.slice(4, -4)).toBe(nasty);
  });

  it("dollarQuote never lets a text ending in $j close the quote early", () => {
    for (const nasty of ["ends with $j", "$j", "a$j1", "x $j$j", "$"]) {
      const q = dollarQuote(nasty);
      const m = /^\$(j\d*)\$([\s\S]*)\$\1\$$/.exec(q);
      expect(m, nasty).not.toBeNull();
      expect(m?.[2], nasty).toBe(nasty);
      // The first closing delimiter in the whole literal must be the real one (what Postgres sees).
      const tag = m?.[1] ?? "";
      expect(q.indexOf(`$${tag}$`, tag.length + 2), nasty).toBe(q.length - tag.length - 2);
    }
    expect(dollarQuote("ends with $j")).not.toBe("$j$ends with $j$j$");
  });

  it("jsonLiteral survives quotes, dollar signs and backslashes", () => {
    const value = { a: "it's $$ done $j$", b: ["\\n", "é"] };
    const lit = jsonLiteral(value);
    const m = /^\$(j\d*)\$([\s\S]*)\$\1\$::jsonb$/.exec(lit);
    expect(m).not.toBeNull();
    expect(JSON.parse(m?.[2] ?? "")).toEqual(value);
    expect(m?.[2]).not.toContain(`$${m?.[1]}$`);
  });

  it("rejects NUL characters", () => {
    expect(() => quoteLiteral("a\u0000b")).toThrow(/NUL/);
    expect(() => jsonLiteral({ a: "a\u0000b" })).toThrow(/NUL/);
  });
});

describe("generated seed migration", () => {
  const items = loadContentItems();
  const lock = readLock();
  const inputFor = () => ({
    file: SEED_MIGRATION_FILE,
    allCatalogues: items.catalogues,
    catalogues: items.catalogues,
    policies: items.policies,
    targetSets: items.targetSets.map((t) => ({ ...t, catalogue: lock.targetSets[t.id]?.catalogue ?? "" })),
  });

  it("is deterministic", () => {
    expect(buildSeedSql(inputFor())).toBe(buildSeedSql(inputFor()));
  });

  it("ends by recording its version and never touches schema public", () => {
    const sql = buildSeedSql(inputFor());
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0006') on conflict do nothing;")).toBe(true);
    expect(sql).not.toMatch(/\bpublic\./);
    expect(sql).not.toMatch(/grant\s/i);
  });

  it("publishes the catalogue before the target sets that need it", () => {
    const sql = buildSeedSql(inputFor());
    expect(sql.indexOf("update english.catalogue_versions set published_at")).toBeGreaterThan(0);
    expect(sql.indexOf("update english.catalogue_versions set published_at")).toBeLessThan(
      sql.indexOf("insert into english.target_set_definitions"),
    );
  });

  it("covers every activity type in the catalogue", () => {
    const cat = items.catalogues[0];
    expect(Object.keys(ACTIVITY_TRACKS).sort()).toEqual(cat?.data.meta.activity_types.items.map((a) => a.id).sort());
  });

  it("the checked-in file equals the generator output (no drift)", async () => {
    const onDisk = await readFile(path.join(MIGRATIONS_DIR, SEED_MIGRATION_FILE), "utf8");
    expect(onDisk).toBe(buildSeedSql(inputFor()));
  });
});
