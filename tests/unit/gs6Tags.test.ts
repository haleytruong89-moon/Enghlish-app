import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

type TagFile = { track: string; tags: { key: string; label_vi: string; group_vi: string; group_key: string }[] };
const json = (...p: string[]) => JSON.parse(readFileSync(path.join(CONTENT_DIR, ...p), "utf8")) as unknown;
const sm1 = json("skill_map", "SM-1.json") as { domains: { key: string; groups: { key: string; leaves: { kind: string; track: string; ref: string }[] }[] }[] };
const domainOf = new Map(sm1.domains.flatMap((d) => d.groups.map((g) => [g.key, d.key] as const)));
const GROUP_VI: Record<string, string> = { grammar: "Ngữ pháp", vocab: "Từ vựng", speaking: "Phát âm" };

// Fixed for ever: the parent approved this list on 26/11/2026 (Book Map of Global Success 6); exercise files prepared outside the app use these keys.
const BATCHES = [
  { file: "gs6_t1_A.json", migration: "0045_seed_tags_global_success_6_tap_1.sql", version: "0045", count: 23, units: "Unit 1–6" },
  { file: "gs6_t2_A.json", migration: "0046_seed_tags_global_success_6_tap_2.sql", version: "0046", count: 21, units: "Unit 7–12" },
] as const;
const KEYS: Record<string, string[]> = {
  "gs6_t1_A.json": [
    "trang-tu-tan-suat", "so-huu-cach", "gioi-tu-noi-chon", "hien-tai-tiep-dien", "hien-tai-don-va-tiep-dien", "danh-tu-dem-khong-dem", "must-mustnt",
    "should-shouldnt", "some-any-chi-luong", "tv-truong-hoc", "tv-cum-play-do-have-study", "tv-nha-cua", "tv-ngoai-hinh", "tv-tinh-cach", "tv-khu-pho",
    "tv-thien-nhien-du-lich", "tv-tet", "pa-aa-uh", "pa-s-z-cuoi-tu", "pa-b-p", "pa-i-ee", "pa-t-d", "pa-s-sh",
  ],
  "gs6_t2_A.json": [
    "tu-hoi-wh", "lien-tu-and-but-so", "cau-menh-lenh", "tinh-tu-so-huu", "dai-tu-so-huu", "might-kha-nang", "mao-tu-a-an-the", "dieu-kien-loai-1", "so-sanh-nhat",
    "tv-chuong-trinh-tv", "tv-the-thao-tro-choi", "tv-thanh-pho-dia-danh", "tv-nha-tuong-lai-do-gia-dung", "tv-reduce-reuse-recycle", "tv-hoat-dong-hang-ngay",
    "pa-th-dh", "pa-e-ae", "pa-ou-au", "pa-trong-am-2-am-tiet", "pa-nhip-dieu-cau", "pa-ngu-dieu-xuong",
  ],
};
const files = Object.fromEntries(BATCHES.map((b) => [b.file, json("tags", b.file) as TagFile]));

describe("Global Success 6 tags for Track A (migrations 0045, 0046)", () => {
  for (const b of BATCHES) {
    const f = files[b.file]!;
    it(`${b.file}: exactly the ${b.count} approved keys of ${b.units}, each in an existing SM-1 group`, () => {
      expect(f.track).toBe("A");
      expect(f.tags.map((t) => t.key)).toEqual(KEYS[b.file]);
      expect(f.tags).toHaveLength(b.count);
      for (const t of f.tags) {
        expect(t.key).toMatch(/^[a-z0-9][a-z0-9-]{1,60}$/);
        expect(t.key, t.key).not.toMatch(/^x-/);
        expect(t.label_vi.trim().length, t.key).toBeGreaterThan(0);
        expect(t.label_vi.length, t.key).toBeLessThanOrEqual(120);
        expect(t.group_key, t.key).toMatch(/^[a-z]{2}-[a-z-]{2,30}$/);
        // sp-pron is the SM-1 group "Phát âm & ngữ điệu"; the other two domains are Ngữ pháp / Từ vựng.
        expect(["grammar", "vocab", "speaking"], t.key).toContain(domainOf.get(t.group_key));
        expect(t.group_vi, t.key).toBe(GROUP_VI[domainOf.get(t.group_key) ?? ""]);
        if (t.key.startsWith("pa-")) expect(t.group_key).toBe("sp-pron");
        if (t.key.startsWith("tv-") && t.key !== "tv-cum-play-do-have-study") expect(t.group_key).toBe("vo-topic");
      }
    });

    it(`${b.migration} seeds exactly these rows, in this order, with the group in seed_group_key, and only adds rows`, () => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, b.migration), "utf8");
      const rows = [...sql.matchAll(/\('A', (\d+), '([a-z0-9-]+)', '((?:[^']|'')+)', '([^']+)', '([a-z-]+)'\)/g)].map((m) => ({
        ord: Number(m[1]), key: m[2], label_vi: m[3]!.replace(/''/g, "'"), group_vi: m[4], group_key: m[5],
      }));
      expect(rows).toEqual(f.tags.map((t, i) => ({ ord: i + 1, ...t })));
      expect(sql).toContain("insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)");
      expect(sql).toMatch(/on conflict \(track_id, key\) do nothing;/);
      // 0042 already added the column and redefined the readers of a tag's group; this migration must not touch them.
      expect(sql).not.toMatch(/\b(alter table|create or replace function|drop |create table)\b/i);
      expect(sql).toMatch(new RegExp(`insert into english\\.schema_migrations\\(version\\) values \\('${b.version}'\\) on conflict do nothing;\\s*$`));
    });
  }

  it("are new: no clash (key or label) with any other Track A tag file or SM-1 leaf; labels are unique ignoring case", () => {
    const others = ["tags_A.json", "reading_A.json", "listening_A.json"].map((f) => json("tags", f) as TagFile);
    const otherKeys = others.flatMap((o) => o.tags.map((t) => t.key));
    const otherLabels = others.flatMap((o) => o.tags.map((t) => t.label_vi.toLowerCase()));
    const leaves = sm1.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves)).filter((l) => l.kind === "tag" && l.track === files["gs6_t1_A.json"]!.track).map((l) => l.ref);
    const all = BATCHES.flatMap((b) => files[b.file]!.tags);
    expect(all).toHaveLength(44);
    expect(new Set(all.map((t) => t.key)).size).toBe(44);
    expect(new Set(all.map((t) => t.label_vi.toLowerCase())).size).toBe(44);
    for (const t of all) {
      expect(otherKeys, t.key).not.toContain(t.key);
      expect(otherLabels, t.key).not.toContain(t.label_vi.toLowerCase());
      expect(leaves, t.key).not.toContain(t.key);
    }
  });

  it("the tags the Book Map reuses are still there (hien-tai-don, hien-tai-don-s-es, so-sanh, qua-khu-don, phat-am, tu-vung-chu-de)", () => {
    const keys = (json("tags", "tags_A.json") as TagFile).tags.map((t) => t.key);
    for (const k of ["hien-tai-don", "hien-tai-don-s-es", "so-sanh", "qua-khu-don", "phat-am", "tu-vung-chu-de"]) expect(keys).toContain(k);
  });
});
