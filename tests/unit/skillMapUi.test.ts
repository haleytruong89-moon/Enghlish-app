import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DomainTabs } from "@/components/tutor/DomainTabs";
import { GroupPicker } from "@/components/tutor/GroupPicker";
import { SetGroupControl } from "@/components/tutor/SetGroupControl";
import { DomainTiles } from "@/components/tutor/DomainTiles";
import { TagChips } from "@/components/tutor/TagChips";
import { TagSelect } from "@/components/tutor/TagSelect";
import { skillMapCopy, weakPage } from "@/lib/copy/vi";
import { groupTags, groupWeakPoints } from "@/lib/skillmap/group";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { fixtureMap } from "./fixtures/skillMap";

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

describe("GroupPicker and SetGroupControl", () => {
  it("lists the 7 domains; the group select stays disabled until a domain is chosen, then lists its groups", () => {
    const none = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag" }));
    expect((none.match(/<option value="(grammar|vocab|reading|listening|writing|speaking|thinking)"/g) ?? []).length).toBe(7);
    expect(none).toMatch(/<select[^>]*disabled=""[^>]*data-testid="add-tag-group"|<select[^>]*data-testid="add-tag-group"[^>]*disabled=""/);
    const vocab = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag", defaultDomain: "vocab" }));
    expect(vocab).toContain('<option value="vo-word-form">Dạng từ</option>');
    expect(vocab).not.toContain('value="gr-conditional"');
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
