import { describe, expect, it } from "vitest";
import { sameInstant } from "@/lib/studio/instant";

describe("sameInstant (optimistic lock compares instants, not text)", () => {
  it("the same instant in two time zones is equal; one microsecond apart is not", () => {
    expect(sameInstant("2026-11-05T03:00:00.123456+00:00", "2026-11-05T10:00:00.123456+07:00")).toBe(true);
    expect(sameInstant("2026-11-05T03:00:00.123456+00:00", "2026-11-05T03:00:00.123457+00:00")).toBe(false);
    expect(sameInstant("2026-11-05 03:00:00+00", "2026-11-05T03:00:00.000000Z")).toBe(true);
    expect(sameInstant("garbage", "garbage")).toBe(false);
  });
});
