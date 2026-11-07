import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DomainTabs, nextTabKey, searchHits } from "@/components/tutor/DomainTabs";
import { effectiveDomain, GroupPicker } from "@/components/tutor/GroupPicker";
import { SetGroupControl } from "@/components/tutor/SetGroupControl";
import { DomainTiles } from "@/components/tutor/DomainTiles";
import { TagChips } from "@/components/tutor/TagChips";
import { TagSelect } from "@/components/tutor/TagSelect";
import { skillMapCopy, weakPage } from "@/lib/copy/vi";
import { foldVi } from "@/lib/text/fold";
import { groupTags, groupWeakPoints } from "@/lib/skillmap/group";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { fixtureMap, levelledMap } from "./fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const tag = (key: string, over: Partial<TagInfo> = {}): TagInfo => ({ key, label: key, group: null, custom: false, ...over });
const map = fixtureMap();
const buckets = groupTags(map, [tag("dang-tu"), tag("cum-dong-tu"), tag("phat-am"), tag("doc-hieu"), tag("x-dao-ngu-hardly", { custom: true })]);
const tabs = (active: string) =>
  render(
    createElement(DomainTabs<TagInfo>, {
      buckets, active, onActive: vi.fn(), testId: "t", itemKey: (x: TagInfo) => x.key, itemText: (x: TagInfo) => x.label,
      renderItem: (x: TagInfo) => createElement("span", { "data-testid": `item-${x.key}` }, x.label),
    }),
  );

describe("DomainTabs", () => {
  it("7 domain tabs + 'Chưa xếp mảng', each with its count; the active one is selected", () => {
    const html = tabs("vocab");
    for (const k of ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "unassigned"]) expect(html).toContain(`data-testid="tab-t-${k}"`);
    const tab = html.match(/<button[^>]*data-testid="tab-t-vocab"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(tab).toContain('aria-selected="true"');
    expect(tab).toContain("Từ vựng");
    expect(tab).toMatch(/>2<\/span>/);
    expect(html).toContain(skillMapCopy.unassigned);
  });

  it("renders every panel, hides the inactive ones, titles each group, and says when a domain is empty", () => {
    const html = tabs("vocab");
    expect(html).toMatch(/<div[^>]*role="tabpanel"[^>]*data-testid="panel-t-vocab"/);
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*data-testid="panel-t-speaking"/);
    expect(html).not.toMatch(/<div[^>]*hidden=""[^>]*data-testid="panel-t-vocab"/);
    expect(html).toContain(">Dạng từ</h3>");
    expect(html).toContain('data-testid="item-phat-am"'); // in the hidden speaking panel
    expect(html).not.toContain('data-testid="item-doc-hieu"'); // hidden from the picker
    expect(html).toContain(skillMapCopy.emptyDomain); // listening has nothing
    expect(html).toContain(`aria-label="${skillMapCopy.search}"`);
  });
});

describe("DomainTabs search is accent-insensitive", () => {
  const acc = groupTags(map, [tag("dang-tu", { label: "Dạng từ" }), tag("cum-dong-tu", { label: "Cụm động từ" })]);
  const find = (q: string) => searchHits(acc, foldVi(q), (t: TagInfo) => t.label).map((h) => h.it.key);
  it("an unaccented query finds an accented item", () => {
    expect(find("dang tu")).toEqual(["dang-tu"]);
    expect(find("CUM DONG")).toEqual(["cum-dong-tu"]);
  });
  it("matching the group name still lists the items of the group", () => {
    const group = acc.flatMap((b) => b.groups)[0]!;
    expect(find(group.name).length).toBeGreaterThanOrEqual(group.items.length);
  });
});

describe("DomainTabs follows the ARIA tabs pattern", () => {
  it("only the selected tab is in the tab order; panels can take focus", () => {
    const html = tabs("vocab");
    expect(html.match(/<button[^>]*data-testid="tab-t-vocab"[^>]*>/)?.[0]).toContain('tabindex="0"');
    expect(html.match(/<button[^>]*data-testid="tab-t-grammar"[^>]*>/)?.[0]).toContain('tabindex="-1"');
    expect(html.match(/<div[^>]*role="tabpanel"[^>]*data-testid="panel-t-vocab"[^>]*>/)?.[0]).toContain('tabindex="0"');
  });

  it("arrows move to the neighbour and wrap, Home and End go to the ends, other keys do nothing", () => {
    const keys = ["grammar", "vocab", "reading"];
    expect(nextTabKey(keys, "vocab", "ArrowRight")).toBe("reading");
    expect(nextTabKey(keys, "reading", "ArrowRight")).toBe("grammar");
    expect(nextTabKey(keys, "grammar", "ArrowLeft")).toBe("reading");
    expect(nextTabKey(keys, "vocab", "ArrowLeft")).toBe("grammar");
    expect(nextTabKey(keys, "vocab", "Home")).toBe("grammar");
    expect(nextTabKey(keys, "vocab", "End")).toBe("reading");
    expect(nextTabKey(keys, "vocab", "Enter")).toBeNull();
    expect(nextTabKey([], "vocab", "Home")).toBeNull();
  });
});

describe("GroupPicker and SetGroupControl", () => {
  it("lists the 7 domains; the group select stays disabled until a domain is chosen, then lists its groups", () => {
    const none = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag" }));
    expect((none.match(/<option value="(grammar|vocab|reading|listening|writing|speaking|thinking)"/g) ?? []).length).toBe(7);
    expect(none).toMatch(/<select[^>]*disabled=""[^>]*data-testid="add-tag-group"|<select[^>]*data-testid="add-tag-group"[^>]*disabled=""/);
    const vocab = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag", defaultDomain: "vocab" }));
    expect(vocab).toContain('<option value="vo-word-form">Dạng từ</option>');
    expect(vocab).not.toContain('value="gr-conditional"');
  });

  it("the domain follows the default (the open tab) until the user picks one in this picker", () => {
    expect(effectiveDomain(null, "vocab")).toBe("vocab");
    expect(effectiveDomain(null, "reading")).toBe("reading"); // the tab changed, nothing picked yet
    expect(effectiveDomain("grammar", "reading")).toBe("grammar"); // the user's pick wins
    expect(effectiveDomain("", "reading")).toBe(""); // "— Chọn mảng —" chosen on purpose
    expect(effectiveDomain(null, null)).toBe("");
  });

  it("'Xếp vào nhóm' starts as one button", () => {
    const html = render(createElement(SetGroupControl, { map, tagKey: "x-dao-ngu-hardly", onSetGroup: vi.fn() }));
    expect(html).toContain('data-testid="set-group-x-dao-ngu-hardly"');
    expect(html).toContain(skillMapCopy.setGroup);
  });
});

describe("pickers by domain", () => {
  const tags = [tag("dang-tu"), tag("thanh-ngu"), tag("phat-am"), tag("doc-hieu"), tag("x-dao-ngu-hardly", { custom: true, label: "Đảo ngữ với hardly" })];

  it("TagChips opens on the tab of the first chosen tag, says what is chosen, hides the hidden leaf, offers 'Xếp vào nhóm', and '+ nhãn khác' needs a group", () => {
    const html = render(createElement(TagChips, { tags, map, selected: ["phat-am"], onChange: vi.fn(), max: 3, onAdd: vi.fn(), onSetGroup: vi.fn(), testId: "session-tags" }));
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*data-testid="tab-session-tags-speaking"/);
    expect(html).toContain(skillMapCopy.chosen("phat-am"));
    expect(html).not.toContain('data-testid="tag-chip-doc-hieu"');
    expect(html).toContain('data-testid="set-group-x-dao-ngu-hardly"');
    expect(html).toContain('data-testid="add-tag-domain"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="add-tag-button"/);
  });

  it("TagChips keeps a hidden tag that was already saved, ticked and locked", () => {
    const html = render(createElement(TagChips, { tags, map, selected: ["doc-hieu"], locked: ["doc-hieu"], onChange: vi.fn(), max: 3, onAdd: vi.fn() }));
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*disabled=""[^>]*data-testid="tag-chip-doc-hieu"/);
  });

  it("TagSelect groups options as 'Mảng · Nhóm', 'Chưa xếp mảng' last; the hidden leaf only when it is the current value", () => {
    const html = render(createElement(TagSelect, { tags, map, value: null, onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 4", testId: "q4" }));
    expect(html).toContain(`<optgroup label="${skillMapCopy.place("Từ vựng", "Dạng từ")}">`);
    expect(html.indexOf(`<optgroup label="${skillMapCopy.unassigned}">`)).toBeGreaterThan(html.indexOf(`<optgroup label="${skillMapCopy.place("Nói", "Phát âm & ngữ điệu")}">`));
    expect(html).not.toContain('value="doc-hieu"');
    expect(render(createElement(TagSelect, { tags, map, value: "doc-hieu", onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 4" }))).toContain('value="doc-hieu"');
  });
});

describe("DomainTiles", () => {
  const point = (tagKey: string, status: WeakPoint["status"]): WeakPoint => ({
    tagKey, label: tagKey, group: null, sources: 1, bySource: { test: 1, lesson: 0, writing: 0, practice: 0 }, itemsWrong: { test: 1, practice: 0 },
    asked: 0, askedWrong: 0, lastSeen: "2026-10-20", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
  });

  it("one tile per domain with how many points need attention and the worst one; links keep the window; 'Xem tất cả' last", () => {
    const tiles = groupWeakPoints(map, [point("dang-tu", "repeat"), point("thanh-ngu", "watch"), point("phat-am", "ok")]);
    const html = render(createElement(DomainTiles, { tiles, learnerId: "L1", weeks: "8", active: "vocab" }));
    for (const k of ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "all"]) expect(html).toContain(`data-testid="weak-tile-${k}"`);
    expect(html).toContain('href="/learners/L1/weak?weeks=8&amp;domain=grammar"');
    expect(html).toContain('href="/learners/L1/weak?weeks=8&amp;domain=all"');
    expect(html).toContain(weakPage.tileCount(2));
    expect(html).toContain(weakPage.tileWorst("dang-tu"));
    expect(html).toContain(weakPage.tileCount(0)); // speaking: phat-am is "ok"
    expect(html.match(/<a[^>]*data-testid="weak-tile-vocab"[^>]*>/)?.[0]).toContain('aria-current="page"');
    expect(html.match(/<a[^>]*data-testid="weak-tile-grammar"[^>]*>/)?.[0]).not.toContain("aria-current");
  });

  it("the Đọc tile counts reading skills that need attention even when another tile is open; without them it says there is nothing", () => {
    const tiles = groupWeakPoints(map, [point("dang-tu", "repeat")]);
    const open = render(createElement(DomainTiles, { tiles, learnerId: "L1", weeks: "8", active: "vocab", readingWeak: 3 }));
    const tile = open.match(/<a[^>]*data-testid="weak-tile-reading"[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(tile).toContain(weakPage.tileReading(3));
    expect(tile).not.toContain(weakPage.tileCount(0)); // reading has something to look at
    expect(tile).not.toContain("aria-current");
    const none = render(createElement(DomainTiles, { tiles, learnerId: "L1", weeks: "8", active: "vocab" }));
    const empty = none.match(/<a[^>]*data-testid="weak-tile-reading"[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(empty).toContain(weakPage.tileCount(0));
    expect(empty).not.toContain("kỹ năng đọc cần chú ý");
  });
});

describe("SM-2 P4-c in the pickers", () => {
  const near = groupTags(levelledMap(), [tag("dang-tu"), tag("cum-dong-tu"), tag("thanh-ngu")]);
  it("DomainTabs keeps other levels in a closed 'Cấp khác (n)' under the near groups; search still finds them", () => {
    const html = render(
      createElement(DomainTabs<TagInfo>, {
        buckets: near, active: "vocab", onActive: vi.fn(), testId: "t", itemKey: (x: TagInfo) => x.key, itemText: (x: TagInfo) => x.label,
        renderItem: (x: TagInfo) => createElement("span", { "data-testid": `item-${x.key}` }, x.label),
      }),
    );
    const far = html.match(/<details[^>]*data-testid="far-t-vocab"[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(far).toContain(skillMapCopy.otherLevels(1));
    expect(far).toContain('data-testid="item-cum-dong-tu"');
    expect(far).not.toContain('data-testid="item-dang-tu"');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.indexOf('data-testid="item-dang-tu"')).toBeLessThan(html.indexOf('data-testid="item-cum-dong-tu"'));
  });

  it("TagSelect lists the near groups first and labels the others '· cấp khác'", () => {
    const html = render(createElement(TagSelect, { tags: [tag("cum-dong-tu"), tag("dang-tu")], map: levelledMap(), value: null, onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 1" }));
    expect(html.indexOf('value="dang-tu"')).toBeGreaterThan(0);
    expect(html.indexOf('value="cum-dong-tu"')).toBeGreaterThan(html.indexOf('value="dang-tu"'));
    expect(html).toContain(`label="${skillMapCopy.farPlace(skillMapCopy.place("Từ vựng", "Kết hợp từ, cụm động từ, thành ngữ"))}"`);
  });
});

describe("SM-2 P4-c: TagChips splits near/far by the selection at mount", () => {
  it("a far tag that is already chosen when the screen opens is listed with the near ones; one that is not stays under 'Cấp khác'", () => {
    const tags = [tag("dang-tu"), tag("cum-dong-tu"), tag("thanh-ngu")];
    const open = render(createElement(TagChips, { tags, map: levelledMap(), selected: ["cum-dong-tu"], onChange: vi.fn(), max: 3, onAdd: vi.fn(), testId: "t" }));
    expect(open).not.toMatch(/<details[^>]*data-testid="far-t-vocab"/);
    const fresh = render(createElement(TagChips, { tags, map: levelledMap(), selected: [], onChange: vi.fn(), max: 3, onAdd: vi.fn(), testId: "t" }));
    expect(fresh).toMatch(/<details[^>]*data-testid="far-t-vocab"[\s\S]*?tag-chip-cum-dong-tu/);
  });
});
