import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DomainTabs } from "@/components/tutor/DomainTabs";
import { GroupPicker } from "@/components/tutor/GroupPicker";
import { SetGroupControl } from "@/components/tutor/SetGroupControl";
import { skillMapCopy } from "@/lib/copy/vi";
import { groupTags } from "@/lib/skillmap/group";
import type { TagInfo } from "@/lib/tutorwork/types";
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
