import { describe, expect, it } from "vitest";
import { buildPrefill, formatRange, prefillTitle, readPrefill } from "@/lib/prefill";

describe("prefill", () => {
  it("round trip", () => {
    const sp = buildPrefill({ title: "Destination C1 · Review 2 (Unit 3–4)", pages: "34", units: ["U3", "U4"] });
    const back = readPrefill(Object.fromEntries(sp.entries()));
    expect(back).toEqual({ title: "Destination C1 · Review 2 (Unit 3–4)", pages: "34", units: ["U3", "U4"] });
  });
  it("hostile input is cut or dropped", () => {
    const r = readPrefill({ title: "<script>alert(1)</script>\n" + "x".repeat(500), pages: "34; drop table", units: "U3,../../etc,u4,U5,X-STARTER" });
    expect(r.title!.length).toBeLessThanOrEqual(200);
    expect(r.title).not.toMatch(/[\n\r]/);
    expect(r.pages).toBeNull();
    expect(r.units).toEqual(["U3", "U5", "X-STARTER"]);
  });
  it("at most 12 units and nothing for empty values", () => {
    const units = Array.from({ length: 30 }, (_, i) => `U${i + 1}`);
    expect(readPrefill({ units: units.join(",") }).units).toHaveLength(12);
    expect(buildPrefill({}).toString()).toBe("");
    expect(readPrefill({})).toEqual({ title: null, pages: null, units: [] });
  });
  it("formatRange", () => {
    expect(formatRange(["U3", "U4"])).toBe("3–4");
    expect(formatRange(["U1", "U2", "U4"])).toBe("1–2, 4");
    expect(formatRange(["U2", "X-STARTER"])).toBe("2, X-STARTER");
    expect(formatRange([])).toBe("");
  });
  it("prefillTitle", () => {
    expect(prefillTitle("Destination C1", "Review 2", ["U3", "U4"])).toBe("Destination C1 · Review 2 (Unit 3–4)");
    expect(prefillTitle("Destination C1", "Review 2", [])).toBe("Destination C1 · Review 2");
  });
});
