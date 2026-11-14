import { describe, expect, it } from "vitest";
import { chooserHref, parseWay, RECOMMENDED, WAYS, wayHref } from "@/lib/assign/ways";

const L = "a0000000-0000-4000-8000-000000000001";
const P = { title: "Destination C1 · Review 2", pages: "34", units: ["U3", "U4"] };
const Q = "title=Destination+C1+%C2%B7+Review+2&pages=34&units=U3%2CU4";

describe("assign ways", () => {
  it("display order, Studio recommended", () => {
    expect([...WAYS]).toEqual(["studio", "link", "pdf", "topic"]);
    expect(RECOMMENDED).toBe("studio");
  });
  it("parseWay", () => {
    expect(parseWay("pdf")).toBe("pdf");
    expect(parseWay(["link"])).toBe("link");
    expect(parseWay("x")).toBeNull();
    expect(parseWay(undefined)).toBeNull();
  });
  it("wayHref without and with a prefill", () => {
    expect(wayHref(L, "studio")).toBe(`/studio/new?learner=${L}`);
    expect(wayHref(L, "link")).toBe(`/learners/${L}/assign?way=link`);
    expect(wayHref(L, "pdf")).toBe(`/learners/${L}/assign?way=pdf`);
    expect(wayHref(L, "topic")).toBe(`/learners/${L}/inquiries`);
    expect(wayHref(L, "studio", P)).toBe(`/studio/new?learner=${L}&${Q}`);
    expect(wayHref(L, "link", P)).toBe(`/learners/${L}/assign?way=link&${Q}`);
    expect(wayHref(L, "pdf", P)).toBe(`/learners/${L}/assign?way=pdf&${Q}`);
  });
  it("topic never carries a title; hostile text is cut", () => {
    expect(wayHref(L, "topic", P)).not.toContain("title");
    expect(wayHref(L, "link", { title: "a\nb", units: ["U3", "../x"] })).toBe(`/learners/${L}/assign?way=link&title=a+b&units=U3`);
  });
  it("chooserHref", () => {
    expect(chooserHref(L)).toBe(`/learners/${L}/assign`);
    expect(chooserHref(L, P)).toBe(`/learners/${L}/assign?${Q}`);
  });
});
