import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { readSkillMapFile, type SkillMapFile } from "../../lib/skillmap/file";
import { CEFR_LEVELS, DOMAIN_KEYS } from "../../lib/skillmap/types";

type Leaf = SkillMapFile["domains"][number]["groups"][number]["leaves"][number];
type Target = {
  id: string; track: string; dimension_id: string; input_modality: string | null; output_modality: string; target_demand: string;
  cefr_ref: { level: string } | null;
};

const { file: map } = readSkillMapFile();
const json = (...p: string[]) => JSON.parse(readFileSync(path.join(CONTENT_DIR, ...p), "utf8")) as unknown;
const catalogue = json("catalogue_v0.2.json") as { targets: Target[] };
const sets = json("target_sets_v1.json") as { id: string; track: string; target_ids: string[] }[];
const tagFiles = ["tags_A.json", "tags_B.json", "reading_A.json", "reading_B.json"].map((f) => json("tags", f) as { track: string; tags: { key: string }[] });

const placed = map.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves.map((leaf) => ({ domain: d.key, scale: d.scale, group: g.key, leaf }))));
const id = (l: Leaf) => `${l.kind}:${l.track}:${l.ref}`;

const GROUP_KEYS = [
  "gr-tense", "gr-modal", "gr-conditional", "gr-passive-report", "gr-clause", "gr-noun-det", "gr-compare-prep", "gr-verb-pattern", "gr-emphasis", "gr-transform",
  "vo-topic", "vo-word-form", "vo-colloc-idiom", "vo-context", "vo-register",
  "re-gist-detail", "re-inference", "re-purpose-tone", "re-structure", "re-word-ref", "re-strategy",
  "li-gist-detail", "li-attitude", "li-argument-notes", "li-sound",
  "wr-sentence-mech", "wr-paragraph", "wr-cohesion", "wr-genre", "wr-register",
  "sp-pron", "sp-fluency", "sp-present", "sp-interact",
  "th-cause", "th-argue", "th-evaluate", "th-synthesis", "th-exam", "th-self",
];

// Spec §2 rule 3: L1 → grammar · L2 → vocab · L3/L4/L8/X1/X2 → writing or speaking by output · T1–T2 → reading or listening by input ·
// L7, T4 and up, A* → thinking. Only exception: A-L2-COMPENSATE-S → speaking (P1-b).
const BY_DIMENSION: Record<string, string> = {
  L1: "grammar", L2: "vocab", L7: "thinking", T4: "thinking", T5: "thinking", T7: "thinking", T9: "thinking", T11: "thinking",
  A1: "thinking", A3: "thinking", A5: "thinking",
};
const BY_OUTPUT: Record<string, string> = { writing: "writing", speaking: "speaking" };
const BY_INPUT: Record<string, string> = { reading: "reading", listening: "listening" };
function expectedDomain(t: Target): string | undefined {
  if (t.id === "A-L2-COMPENSATE-S") return "speaking";
  if (["L3", "L4", "L8", "X1", "X2"].includes(t.dimension_id)) return BY_OUTPUT[t.output_modality];
  if (["T1", "T2"].includes(t.dimension_id)) return BY_INPUT[t.input_modality ?? ""];
  return BY_DIMENSION[t.dimension_id];
}
function expectedLevels(t: Target, scale: string): Record<string, string | number> {
  if (scale === "cefr") {
    const lv = t.cefr_ref?.level;
    if (!lv) return {};
    const [from, to] = lv.split("-");
    return { level_from: from!, level_to: to ?? from! };
  }
  const m = /^TL(\d)(?:-TL(\d))?\b/.exec(t.target_demand);
  return m ? { task_from: Number(m[1]), task_to: Number(m[2] ?? m[1]) } : {};
}
// Reference bands of the grammar / vocabulary tags (English Profile; the tutor re-checks them).
const LEVELLED_TAGS: Record<string, [string, string]> = {
  "hien-tai-don": ["A1", "A1"], "hien-tai-don-s-es": ["A1", "A1"], "gioi-tu-thoi-gian": ["A1", "A2"], "qua-khu-don": ["A2", "A2"], "so-sanh": ["A2", "A2"],
  "modal-suy-doan": ["B2", "B2"], "wish-would-rather": ["B1", "B2"], "cau-dieu-kien-dao-ngu": ["B1", "C1"], "bi-dong-nho-tuong-thuat": ["B1", "B2"],
  "dang-tu": ["B1", "B2"], "cum-dong-tu": ["B1", "B2"], "thanh-ngu": ["B2", "C1"],
};
const RELATED: string[][] = [
  ["A", "qua-khu-don", "A-L1-PAST-W"], ["A", "doc-main-idea", "A-T1-TEXT-R"], ["A", "nghe", "A-T1-TEXT-L"], ["A", "viet-cau", "A-L3-PARA-W"],
  ["B", "doc-fact-opinion", "B-T5-DATAOP"], ["B", "doc-evidence", "B-T7-ARGUE"], ["B", "doc-conclusions", "B-T11-QUALIFY"],
  ["B", "doc-inference", "B-T2-ASSUME-R"], ["B", "tu-noi-lap-luan", "B-T7-ARGUE"],
];

describe("content/skill_map/SM-1.json (spec §2)", () => {
  it("has the 7 fixed domains in order and the 40 groups of the spec, each once", () => {
    expect(map.id).toBe("SM-1");
    expect(map.catalogue_version).toBe("0.2.1-draft");
    expect(map.domains.map((d) => d.key)).toEqual([...DOMAIN_KEYS]);
    expect(map.domains.map((d) => d.name_vi)).toEqual(["Ngữ pháp", "Từ vựng", "Đọc", "Nghe", "Viết", "Nói", "Tư duy & tự học"]);
    expect(map.domains.map((d) => d.scale)).toEqual(["cefr", "cefr", "cefr", "cefr", "cefr", "cefr", "task_level"]);
    expect(map.domains.flatMap((d) => d.groups.map((g) => g.key))).toEqual(GROUP_KEYS);
  });

  it("describes every group per level band (CEFR domains) or low → high (thinking)", () => {
    for (const d of map.domains)
      for (const g of d.groups) {
        if (d.scale === "cefr") expect(Object.keys(g.desc), g.key).toEqual(["A1-A2", "B1", "B2", "C1-C2"]);
        else expect([Object.keys(g.desc), Boolean(g.desc.low && g.desc.high)], g.key).toEqual([["low", "high"], true]);
        expect(Object.values(g.desc).some((v) => v !== null), g.key).toBe(true);
      }
  });

  it("every seed tag of content/tags/*.json is exactly one leaf, and there is no other tag leaf", () => {
    const want = tagFiles.flatMap((f) => f.tags.map((t) => `tag:${f.track}:${t.key}`)).sort();
    const have = placed.filter((p) => p.leaf.kind === "tag").map((p) => id(p.leaf)).sort();
    expect(want).toHaveLength(40);
    expect(have).toEqual(want);
  });

  it("every catalogue target is exactly one leaf of its own track, in the domain rule 3 gives", () => {
    const targets = placed.filter((p) => p.leaf.kind === "target");
    expect(targets).toHaveLength(70);
    expect(new Set(targets.map((p) => p.leaf.ref)).size).toBe(70);
    for (const t of catalogue.targets) {
      const p = targets.find((x) => x.leaf.ref === t.id);
      expect(p, t.id).toBeDefined();
      expect([p?.leaf.track, p?.domain], t.id).toEqual([t.track, expectedDomain(t)]);
    }
  });

  it("levels: targets copy the catalogue on their domain's scale; tags carry a reference band only where listed", () => {
    const byId = new Map(catalogue.targets.map((t) => [t.id, t]));
    const order = (l: string) => (CEFR_LEVELS as readonly string[]).indexOf(l);
    for (const { scale, leaf } of placed) {
      const lv = Object.fromEntries(
        Object.entries({ level_from: leaf.level_from, level_to: leaf.level_to, task_from: leaf.task_from, task_to: leaf.task_to }).filter(([, v]) => v !== undefined),
      );
      if (leaf.kind === "target") expect(lv, leaf.ref).toEqual(expectedLevels(byId.get(leaf.ref)!, scale));
      else {
        const band = LEVELLED_TAGS[leaf.ref];
        expect(lv, id(leaf)).toEqual(band ? { level_from: band[0], level_to: band[1] } : {});
        expect(leaf.level_note, id(leaf)).toBe(band ? "tham khảo English Profile — gia sư kiểm lại" : undefined);
      }
      if (leaf.level_from && leaf.level_to) expect(order(leaf.level_from) <= order(leaf.level_to), id(leaf)).toBe(true);
      if (leaf.task_from && leaf.task_to) expect(leaf.task_from <= leaf.task_to, id(leaf)).toBe(true);
      if (scale === "cefr") expect(leaf.task_from, id(leaf)).toBeUndefined();
      else expect(leaf.level_from, id(leaf)).toBeUndefined();
    }
  });

  it("'related' holds exactly the spec's pairs, each to an existing target of the same track", () => {
    const trackOf = new Map(catalogue.targets.map((t) => [t.id, t.track]));
    const rel = placed.flatMap((p) => (p.leaf.related ?? []).map((r) => [p.leaf.track, p.leaf.ref, r]));
    expect([...rel].sort()).toEqual([...RELATED].sort());
    for (const [track, , target] of rel) expect(trackOf.get(target!), target).toBe(track);
    for (const p of placed) if (p.leaf.kind === "target") expect(p.leaf.related, p.leaf.ref).toBeUndefined();
  });

  it("only An's old 'Đọc hiểu (KET Reading)' is hidden from the picker (Đọc · Ý chính & chi tiết); no core point yet", () => {
    const hidden = placed.filter((p) => p.leaf.hidden_in_picker);
    expect(hidden.map((p) => [id(p.leaf), p.group])).toEqual([["tag:A:doc-hieu", "re-gist-detail"]]);
    expect(placed.filter((p) => p.leaf.core !== undefined && p.leaf.core !== false)).toEqual([]);
  });

  it("assumed start levels per track (P2-a): An A2 / thinking 1, Nguyên B2 / thinking 2", () => {
    expect(map.assumed).toEqual({
      A: { grammar: "A2", vocab: "A2", reading: "A2", listening: "A2", writing: "A2", speaking: "A2", thinking: 1 },
      B: { grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 },
    });
  });

  it("today's coverage matches the spec: An 17/40 groups, Nguyên 19/40 (tags of the track + skills of the v1 set)", () => {
    const groups = map.domains.flatMap((d) => d.groups);
    const cover = (track: string, set: string[]) =>
      groups.filter((g) => g.leaves.some((l) => (l.kind === "tag" && l.track === track) || (l.kind === "target" && set.includes(l.ref)))).length;
    expect(sets.map((s) => [s.id, cover(s.track, s.target_ids)])).toEqual([["A-v1", 17], ["B-v1", 19]]);
  });

  it("never contains the dollar-quote tag that migration 0019 wraps it in", () => {
    expect(readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8")).not.toContain("$j$");
  });
});
