import { describe, expect, it } from "vitest";
import { aiSettingsCopy, purgePage, revisionReviewCopy, shellCopy } from "@/lib/copy/vi";
import { buildNav, SECTION_KEYS } from "@/lib/shell/nav";

const NG = "b0000000-0000-4000-8000-000000000002";
const AN = "a0000000-0000-4000-8000-000000000001";
const hrefs = (n: ReturnType<typeof buildNav>) => [...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);

describe("staff sidebar model", () => {
  it("follows the prototype order with the agreed labels", () => {
    const n = buildNav("tutor", NG, { revisionsReady: true });
    expect(n.sections.map((s) => s.key)).toEqual(["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "curricula", "inbox"]);
    expect(n.sections.map((s) => s.key)).toEqual([...SECTION_KEYS]);
    for (const s of n.sections) expect(s.label).toBe(shellCopy.sections[s.key]);
  });

  it("sections of later slices are 'soon': no link, no children (no dead link, no 404)", () => {
    const n = buildNav("tutor", NG, { revisionsReady: true });
    for (const key of ["knowledge", "roadmap"] as const) {
      const s = n.sections.find((x) => x.key === key)!;
      expect(s.status).toBe("soon");
      expect(s.href).toBeNull();
      expect(s.children).toEqual([]);
    }
    expect(n.sections.find((x) => x.key === "knowledge")!.lane).toBe("W3");
    expect(n.sections.find((x) => x.key === "roadmap")!.lane).toBe("W5");
  });

  it("every link is about the chosen child and no other", () => {
    const all = hrefs(buildNav("parent", NG, { revisionsReady: true }));
    expect(all.length).toBeGreaterThan(15);
    for (const h of all) {
      expect(h, h).not.toContain(AN);
      if (h !== "/feedback") expect(h.includes(NG) || h.startsWith("/settings/ai"), h).toBe(true);
    }
    expect(all).toContain(`/?learner=${NG}`);
    expect(all).toContain(`/learners/${NG}/inbox`);
    expect(all).toContain(`/studio/new?learner=${NG}`);
    expect(all).toContain(`/review/skills?learner=${NG}`);
  });

  it("only the parent gets the 'Phụ huynh' group (AI settings, delete the child's data)", () => {
    expect(buildNav("tutor", NG, { revisionsReady: true }).parent).toEqual([]);
    const p = buildNav("parent", NG, { revisionsReady: true }).parent;
    expect(p.map((x) => [x.key, x.label])).toEqual([["aiSettings", aiSettingsCopy.navLink], ["delete", purgePage.link]]);
    expect(p.find((x) => x.key === "delete")!.href).toBe(`/learners/${NG}/delete`);
    expect(hrefs(buildNav("tutor", NG, { revisionsReady: true })).some((h) => h.endsWith("/delete"))).toBe(false);
  });

  it("'Bài đã sửa' is left out until migration 0021 is readable (was the N7 test of the learner card)", () => {
    const off = buildNav("tutor", NG, { revisionsReady: false });
    expect(hrefs(off).some((h) => h.includes("/revisions"))).toBe(false);
    const on = buildNav("tutor", NG, { revisionsReady: true }).sections.find((s) => s.key === "inbox")!;
    expect(on.children.find((c) => c.key === "revisions")).toEqual({ key: "revisions", label: revisionReviewCopy.link, href: `/learners/${NG}/revisions` });
  });

  it("with no child yet only the desk has a link", () => {
    const n = buildNav("tutor", null, { revisionsReady: true });
    expect(n.sections.find((s) => s.key === "desk")!.href).toBe("/");
    for (const s of n.sections.filter((x) => x.key !== "desk")) {
      expect(s.href, s.key).toBeNull();
      expect(s.children, s.key).toEqual([]);
    }
  });
});
