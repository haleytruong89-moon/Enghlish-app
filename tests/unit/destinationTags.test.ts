import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

type DestFile = { track: string; tags: { key: string; label_vi: string; group_vi: string; group_key: string }[] };
const json = (...p: string[]) => JSON.parse(readFileSync(path.join(CONTENT_DIR, ...p), "utf8")) as unknown;
const file = json("tags", "destination_B.json") as DestFile;
const sm1 = json("skill_map", "SM-1.json") as { domains: { key: string; groups: { key: string; leaves: { kind: string; track: string; ref: string }[] }[] }[] };
const sql = readFileSync(path.join(MIGRATIONS_DIR, "0042_seed_tags_destination_b.sql"), "utf8");

// Fixed for ever by the hub handover of 24/11 (exercise files prepared outside the app use these keys).
const HANDOVER: [string, string][] = [
  ["thi-hien-tai", "gr-tense"], ["thi-qua-khu", "gr-tense"], ["thi-tuong-lai", "gr-tense"], ["modal-bat-buoc-cho-phep", "gr-modal"],
  ["tinh-tu-trang-tu", "gr-compare-prep"], ["menh-de-quan-he-phan-tu", "gr-clause"], ["cau-phuc", "gr-clause"],
  ["cum-danh-tu-mao-tu", "gr-noun-det"], ["dong-tu-bo-ngu", "gr-verb-pattern"], ["ket-hop-tu", "vo-colloc-idiom"],
  ["chu-de-tu-duy-hoc-tap", "vo-topic"], ["chu-de-thay-doi-cong-nghe", "vo-topic"], ["chu-de-thoi-gian-cong-viec", "vo-topic"],
  ["chu-de-di-chuyen-giao-thong", "vo-topic"], ["chu-de-giao-tiep-truyen-thong", "vo-topic"], ["chu-de-co-hoi-thien-nhien", "vo-topic"],
  ["chu-de-so-luong-tien-bac", "vo-topic"], ["chu-de-vat-lieu-xay-dung", "vo-topic"], ["chu-de-cam-xuc-suc-khoe", "vo-topic"],
  ["chu-de-quyen-luc-xa-hoi", "vo-topic"], ["chu-de-chat-luong-nghe-thuat", "vo-topic"], ["chu-de-quan-he-con-nguoi", "vo-topic"],
  ["chu-de-so-thich-giai-tri", "vo-topic"],
];

describe("Destination tags for Track B (migration 0042)", () => {
  it("are exactly the 23 keys and SM-1 groups of the handover, in Ngữ pháp / Từ vựng", () => {
    expect(file.track).toBe("B");
    expect(file.tags.map((t) => [t.key, t.group_key])).toEqual(HANDOVER);
    const domainOf = new Map(sm1.domains.flatMap((d) => d.groups.map((g) => [g.key, d.key] as const)));
    for (const t of file.tags) {
      expect(t.key).toMatch(/^[a-z0-9][a-z0-9-]{1,60}$/);
      expect(t.label_vi.trim().length, t.key).toBeGreaterThan(0);
      expect(t.label_vi.length, t.key).toBeLessThanOrEqual(120);
      expect(t.group_vi).toBe(({ grammar: "Ngữ pháp", vocab: "Từ vựng" } as Record<string, string>)[domainOf.get(t.group_key) ?? ""]);
      expect(["grammar", "vocab"]).toContain(domainOf.get(t.group_key));
    }
  });

  it("are new: no clash with any other Track B tag file nor with an SM-1 leaf (one tag = one group)", () => {
    const others = ["tags_B.json", "reading_B.json", "listening_B.json"].flatMap((f) => (json("tags", f) as DestFile).tags.map((t) => t.key));
    const leaves = sm1.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves)).filter((l) => l.kind === "tag" && l.track === file.track).map((l) => l.ref);
    for (const t of file.tags) {
      expect(others, t.key).not.toContain(t.key);
      expect(leaves, t.key).not.toContain(t.key);
    }
  });

  it("migration 0042 seeds exactly these rows, in this order, with the group in seed_group_key", () => {
    const rows = [...sql.matchAll(/\('B', (\d+), '([a-z0-9-]+)', '((?:[^']|'')+)', '([^']+)', '([a-z-]+)'\)/g)].map((m) => ({
      ord: Number(m[1]), key: m[2], label_vi: m[3]!.replace(/''/g, "'"), group_vi: m[4], group_key: m[5],
    }));
    expect(rows).toEqual(file.tags.map((t, i) => ({ ord: i + 1, ...t })));
    expect(sql).toContain("insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)");
    expect(sql).toMatch(/on conflict \(track_id, key\) do nothing;/);
    // 0026's group_key rule is untouched: re-running 0026 re-adds it, and it must still hold.
    expect(sql).not.toMatch(/constraint (if exists )?error_tags_group_key_shape/);
    expect(sql).toMatch(/insert into english\.schema_migrations\(version\) values \('0042'\) on conflict do nothing;\s*$/);
  });

  it("redefines the four readers of a tag's group as their previous body with only group_key → coalesce(group_key, seed_group_key)", () => {
    const body = (file: string, start: string, end: string) => {
      const src = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const a = src.indexOf(start);
      return src.slice(a, src.indexOf(end, a) + end.length);
    };
    const cases: [string, string, string, RegExp, string][] = [
      ["0026_curriculum.sql", "create or replace function english.eng_skill_map(p_learner uuid)", "grant execute on function english.eng_skill_map(uuid) to service_role;",
        /\bt\.group_key\b/g, "coalesce(t.group_key, t.seed_group_key)"],
      ["0027_points_import.sql", "create or replace function english.eng_point_inputs(", "grant execute on function english.eng_point_inputs(uuid, text[]) to service_role;",
        /select et\.group_key from english\.error_tags et/g, "select coalesce(et.group_key, et.seed_group_key) from english.error_tags et"],
      ["0020_level_profile.sql", "create or replace function english.eng_my_review_by_domain()", "$$;",
        /g\.key = coalesce\(et\.group_key, lf\.group_key\)/g, "g.key = coalesce(et.group_key, et.seed_group_key, lf.group_key)"],
      ["0021_feedback_revision.sql", "create or replace function english.eng_clean_feedback_items(",
        "revoke execute on function english.eng_clean_feedback_items(jsonb, text, uuid) from public, anon, authenticated, service_role;",
        /where et\.family_id = v_l\.family_id and et\.track_id = v_l\.track_id and et\.key = v_leaf ->> 'ref_key'\n\s+and et\.group_key is not null and et\.retired_at is null\)\) then/g,
        `where et.track_id = v_l.track_id and et.key = v_leaf ->> 'ref_key' and et.retired_at is null
                       and ((et.family_id = v_l.family_id and et.group_key is not null)
                            or (et.family_id is null and et.origin = 'seed' and coalesce(et.group_key, et.seed_group_key) is not null)))) then`],
    ];
    for (const [f, start, end, from, to] of cases) {
      const before = body(f, start, end);
      expect(before.match(from)?.length, f).toBeGreaterThan(0);
      expect(body("0042_seed_tags_destination_b.sql", start, end), f).toBe(before.replace(from, to));
    }
  });
});
