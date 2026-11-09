import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainTabs } from "@/components/tutor/DomainTabs";
import type { Bucket } from "@/lib/skillmap/group";

describe("DomainTabs (UX round 1)", () => {
  it("a tab shows just the domain name, without the small count", () => {
    const buckets: Bucket<string>[] = [{ key: "grammar", name: "Ngữ pháp", total: 4, groups: [{ key: "g1", name: "Thì", items: ["a", "b", "c", "d"] }], far: [] }];
    const html = renderToStaticMarkup(
      createElement(DomainTabs<string>, { buckets, active: "grammar", onActive: () => {}, itemKey: (s) => s, itemText: (s) => s, renderItem: (s) => createElement("span", null, s), testId: "t" }),
    );
    const tab = /data-testid="tab-t-grammar"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1];
    expect(tab).toBe("Ngữ pháp");
  });
});
