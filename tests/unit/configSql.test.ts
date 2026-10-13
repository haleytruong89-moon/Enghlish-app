import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import {
  ACTIVITY_TRACKS,
  buildConfigSql,
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
  const cfg = loadConfig();

  it("is deterministic", () => {
    expect(buildConfigSql(cfg)).toBe(buildConfigSql(loadConfig()));
  });

  it("ends by recording its version and never touches schema public", () => {
    const sql = buildConfigSql(cfg);
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0006') on conflict do nothing;")).toBe(true);
    expect(sql).not.toMatch(/\bpublic\./);
    expect(sql).not.toMatch(/grant\s/i);
  });

  it("covers every activity type in the catalogue", () => {
    expect(Object.keys(ACTIVITY_TRACKS).sort()).toEqual(cfg.catalogue.meta.activity_types.items.map((a) => a.id).sort());
  });

  it("the checked-in file equals the generator output (no drift)", async () => {
    const onDisk = await readFile(path.join(MIGRATIONS_DIR, SEED_MIGRATION_FILE), "utf8");
    expect(onDisk).toBe(buildConfigSql(cfg));
  });
});
