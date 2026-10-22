import { describe, expect, it } from "vitest";
import { skillMapCopy } from "@/lib/copy/vi";
import { domainOfAdded, domainOfGroup, firstTab, groupTags, groupTargets, groupWeakPoints, placeOfTag } from "@/lib/skillmap/group";
import { parseSkillMap } from "@/lib/skillmap/shape";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { fixtureMap } from "./fixtures/skillMap";

const tag = (key: string, over: Partial<TagInfo> = {}): TagInfo => ({ key, label: key, group: null, custom: false, ...over });
const weak = (tagKey: string, status: WeakPoint["status"], sources = 1): WeakPoint => ({
  tagKey, label: tagKey, group: null, sources, bySource: { test: sources, lesson: 0, writing: 0, practice: 0 }, itemsWrong: { test: 0, practice: 0 },
  asked: 0, askedWrong: 0, lastSeen: "2026-10-20", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
});
const map = fixtureMap();

describe("groupTags", () => {
  const tags = [
    tag("dang-tu"), tag("cum-dong-tu"), tag("cau-dieu-kien-dao-ngu"), tag("doc-hieu"), tag("doc-main-idea"),
    tag("x-dao-ngu-hardly", { custom: true }), // family tag from before SM-1: no group
    tag("x-moi-abcde", { custom: true, groupKey: "gr-emphasis" }), // just added through v2 (not in the map yet)
    tag("khong-co-trong-ban-do"), // seed tag the map does not know
  ];

  it("always 7 domains in map order, empty ones kept, groups in map order, then 'Chưa xếp mảng'", () => {
    const b = groupTags(map, tags);
    expect(b.map((x) => x.key)).toEqual(["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "unassigned"]);
    expect(b[0]?.groups.map((g) => [g.key, g.items.map((t) => t.key)])).toEqual([
      ["gr-conditional", ["cau-dieu-kien-dao-ngu"]],
      ["gr-emphasis", ["x-moi-abcde"]],
    ]);
    expect(b[1]?.groups.map((g) => g.name)).toEqual(["Dạng từ", "Kết hợp từ, cụm động từ, thành ngữ"]);
    expect(b[3]).toEqual({ key: "listening", name: "Nghe", total: 0, groups: [] });
    expect(b[7]).toMatchObject({ name: skillMapCopy.unassigned, total: 2 });
    expect(b[7]?.groups[0]?.items.map((t) => t.key)).toEqual(["x-dao-ngu-hardly", "khong-co-trong-ban-do"]);
  });

  it("drops a leaf hidden from the picker unless it is kept (already chosen or saved)", () => {
    expect(groupTags(map, tags)[2]?.groups[0]?.items.map((t) => t.key)).toEqual(["doc-main-idea"]);
    expect(groupTags(map, tags, { keep: ["doc-hieu"] })[2]?.groups[0]?.items.map((t) => t.key)).toEqual(["doc-hieu", "doc-main-idea"]); // input order
  });

  it("has no 'Chưa xếp mảng' bucket when everything has a group", () => {
    expect(groupTags(map, [tag("dang-tu")]).map((x) => x.key)).not.toContain("unassigned");
  });
});

describe("groupTargets, placeOfTag, domainOfGroup, firstTab", () => {
  it("places skills by the map; an id the map does not know goes to 'Chưa xếp mảng'", () => {
    const b = groupTargets(map, [{ id: "B-T7-ARGUE", title: "Lập luận" }, { id: "B-L1-TRANSFORM-W", title: "Viết lại câu" }, { id: "B-W-1", title: "?" }]);
    expect(b.find((x) => x.key === "thinking")?.total).toBe(1);
    expect(b.find((x) => x.key === "grammar")?.groups[0]?.items[0]?.id).toBe("B-L1-TRANSFORM-W");
    expect(b.find((x) => x.key === "unassigned")?.groups[0]?.items.map((x) => x.id)).toEqual(["B-W-1"]);
  });

  it("a family tag's own group wins; a seed tag uses its leaf; unknown → null", () => {
    expect(placeOfTag(map, { key: "x-new", groupKey: "sp-pron" })).toMatchObject({ domainKey: "speaking", groupKey: "sp-pron", hidden: false });
    expect(placeOfTag(map, { key: "doc-hieu" })).toMatchObject({ domainKey: "reading", groupName: "Ý chính & chi tiết", hidden: true });
    expect(placeOfTag(map, { key: "x-dao-ngu-hardly", groupKey: null })).toBeNull();
    expect(domainOfGroup(map, "vo-word-form")).toBe("vocab");
    expect(domainOfGroup(map, "gr-nope")).toBeNull();
  });

  it("firstTab: the tab of the first preferred item, else the first non-empty tab, else the first", () => {
    const b = groupTags(map, [tag("phat-am"), tag("dang-tu")]);
    expect(firstTab(b)).toBe("vocab");
    expect(firstTab(b, (t) => t.key === "phat-am")).toBe("speaking");
    expect(firstTab(groupTags(map, []))).toBe("grammar");
  });
});

describe("groupWeakPoints", () => {
  it("7 tiles: count of points that need attention, the worst one first, hidden leaves counted; unknown tags in 'Chưa xếp mảng'", () => {
    const tiles = groupWeakPoints(map, [weak("dang-tu", "repeat", 3), weak("cum-dong-tu", "watch"), weak("thanh-ngu", "ok"), weak("doc-hieu", "watch"), weak("x-la", "watch")]);
    expect(tiles.map((t) => [t.key, t.weakCount, t.worst?.tagKey ?? null])).toEqual([
      ["grammar", 0, null], ["vocab", 2, "dang-tu"], ["reading", 1, "doc-hieu"], ["listening", 0, null],
      ["writing", 0, null], ["speaking", 0, null], ["thinking", 0, null], ["unassigned", 1, "x-la"],
    ]);
    expect(tiles[1]?.points.map((p) => p.tagKey)).toEqual(["dang-tu", "cum-dong-tu", "thanh-ngu"]);
    expect(groupWeakPoints(map, []).map((t) => t.key)).not.toContain("unassigned");
  });
});

describe("parseSkillMap", () => {
  const rawLeaf = { kind: "tag", track_id: "B", ref_key: "dang-tu", label_vi: "Dạng từ", level_from: "B1", level_to: "B2", task_from: null, task_to: null,
    core: false, hidden_in_picker: false, related: [], custom: false, in_set: false };
  const raw = { map_id: "SM-1", track_id: "B", assumed: { grammar: "B2", thinking: 2 },
    domains: [{ key: "vocab", name_vi: "Từ vựng", scale: "cefr", groups: [{ key: "vo-word-form", name_vi: "Dạng từ", desc: { "A1-A2": "-er, -ful", B1: "un-, dis-" }, leaves: [rawLeaf] }] }],
    unassigned: [] };

  it("maps snake_case to the view", () => {
    expect(parseSkillMap(raw)).toEqual({
      mapId: "SM-1", trackId: "B", assumed: { grammar: "B2", thinking: 2 }, unassigned: [],
      domains: [{ key: "vocab", name: "Từ vựng", scale: "cefr", groups: [{ key: "vo-word-form", name: "Dạng từ", descriptions: { "A1-A2": "-er, -ful", B1: "un-, dis-" },
        leaves: [{ kind: "tag", trackId: "B", refKey: "dang-tu", label: "Dạng từ", levelFrom: "B1", levelTo: "B2", taskFrom: null, taskTo: null,
          core: false, hiddenInPicker: false, related: [], custom: false, inSet: false }] }] }],
    });
  });

  it("throws on an unknown domain or level instead of showing a half-right picker", () => {
    expect(() => parseSkillMap({ ...raw, domains: [{ ...raw.domains[0], key: "maths" }] })).toThrow();
    expect(() => parseSkillMap({ ...raw, domains: [{ ...raw.domains[0], groups: [{ ...raw.domains[0]!.groups[0], leaves: [{ ...rawLeaf, level_from: "D1" }] }] }] })).toThrow();
  });
});

describe("domainOfAdded (the tab to open after '+ nhãn khác')", () => {
  const map = fixtureMap();
  it("follows the group the server returned, not the one requested; falls back to the tag's own place; unknown = null", () => {
    expect(domainOfAdded(map, { key: "x-moi", groupKey: "vo-word-form" })).toBe("vocab");
    expect(domainOfAdded(map, { key: "dang-tu", groupKey: null })).toBe("vocab"); // the label matched a seed tag
    expect(domainOfAdded(map, { key: "x-la", groupKey: null })).toBeNull();
  });
});
