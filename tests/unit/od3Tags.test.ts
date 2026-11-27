import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

type TagFile = { track: string; tags: { key: string; label_vi: string; group_vi: string; group_key: string }[] };
const json = (...p: string[]) => JSON.parse(readFileSync(path.join(CONTENT_DIR, ...p), "utf8")) as unknown;
const sm1 = json("skill_map", "SM-1.json") as { domains: { key: string; groups: { key: string; leaves: { kind: string; track: string; ref: string }[] }[] }[] };
const domainOf = new Map(sm1.domains.flatMap((d) => d.groups.map((g) => [g.key, d.key] as const)));
const GROUP_VI: Record<string, string> = { grammar: "Ngữ pháp", vocab: "Từ vựng" };

// Fixed for ever: the parent approved this list on 27/11/2026 (Scope and Sequence of Oxford Discover 3); exercise files prepared outside the app use these keys.
const KEYS = [
  "tinh-tu-ed-ing", "trat-tu-tinh-tu", "luong-tu-a-few-a-little", "so-sanh-bang-as-as", "too-either", "hoa-hop-chu-ngu-ghep", "so-sanh-trang-tu",
  "cau-before-after", "tu-chi-don-vi", "trang-tu-trinh-tu", "tinh-tu-gioi-tu", "gioi-tu-chuyen-dong", "want-need-have-to", "cau-although",
  "cum-dong-tu-get", "cum-dong-tu-look", "dong-nghia-trai-nghia", "tien-to-re", "hau-to-ful-less", "danh-tu-ghep",
];
const MIGRATION = "0047_seed_tags_oxford_discover_3.sql";
const f = json("tags", "od3_A.json") as TagFile;

describe("Oxford Discover 3 tags for Track A (migration 0047)", () => {
  it("od3_A.json: exactly the 20 approved keys, each in an existing SM-1 grammar / vocabulary group", () => {
    expect(f.track).toBe("A");
    expect(f.tags.map((t) => t.key)).toEqual(KEYS);
    for (const t of f.tags) {
      expect(t.key).toMatch(/^[a-z0-9][a-z0-9-]{1,60}$/);
      expect(t.label_vi.trim().length, t.key).toBeGreaterThan(0);
      expect(t.label_vi.length, t.key).toBeLessThanOrEqual(120);
      expect(["grammar", "vocab"], t.key).toContain(domainOf.get(t.group_key));
      expect(t.group_vi, t.key).toBe(GROUP_VI[domainOf.get(t.group_key) ?? ""]);
    }
  });

  it(`${MIGRATION} seeds exactly these rows, in this order, with the group in seed_group_key, and only adds rows`, () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8");
    const rows = [...sql.matchAll(/\('A', (\d+), '([a-z0-9-]+)', '((?:[^']|'')+)', '([^']+)', '([a-z-]+)'\)/g)].map((m) => ({
      ord: Number(m[1]), key: m[2], label_vi: m[3]!.replace(/''/g, "'"), group_vi: m[4], group_key: m[5],
    }));
    expect(rows).toEqual(f.tags.map((t, i) => ({ ord: i + 1, ...t })));
    expect(sql).toContain("insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)");
    expect(sql).toMatch(/on conflict \(track_id, key\) do nothing;/);
    expect(sql).not.toMatch(/\b(alter table|create or replace function|drop |create table)\b/i);
    expect(sql).toMatch(/insert into english\.schema_migrations\(version\) values \('0047'\) on conflict do nothing;\s*$/);
  });

  it("are new: no clash (key or label) with any other Track A tag file (Global Success 6 included) or SM-1 leaf", () => {
    const others = ["tags_A.json", "reading_A.json", "listening_A.json", "gs6_t1_A.json", "gs6_t2_A.json"].map((n) => json("tags", n) as TagFile);
    const otherKeys = others.flatMap((o) => o.tags.map((t) => t.key));
    const otherLabels = others.flatMap((o) => o.tags.map((t) => t.label_vi.toLowerCase()));
    const leaves = sm1.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves)).filter((l) => l.kind === "tag" && l.track === f.track).map((l) => l.ref);
    expect(new Set(f.tags.map((t) => t.key)).size).toBe(20);
    expect(new Set(f.tags.map((t) => t.label_vi.toLowerCase())).size).toBe(20);
    for (const t of f.tags) {
      expect(otherKeys, t.key).not.toContain(t.key);
      expect(otherLabels, t.key).not.toContain(t.label_vi.toLowerCase());
      expect(leaves, t.key).not.toContain(t.key);
    }
  });

  it("the tags the Scope and Sequence reuses are still there", () => {
    const keys = ["tags_A.json", "gs6_t1_A.json", "gs6_t2_A.json"].flatMap((n) => (json("tags", n) as TagFile).tags.map((t) => t.key));
    for (const k of ["so-sanh", "so-sanh-nhat", "so-huu-cach", "dai-tu-so-huu", "tinh-tu-so-huu", "mao-tu-a-an-the", "danh-tu-dem-khong-dem", "gioi-tu-noi-chon", "might-kha-nang", "lien-tu-and-but-so"]) {
      expect(keys, k).toContain(k);
    }
  });
});
