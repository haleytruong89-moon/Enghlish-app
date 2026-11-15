import { describe, expect, it } from "vitest";
import { newestAt } from "@/lib/studio/view";

describe("newestAt (the time a 'Đã xem' covers)", () => {
  it("returns the newest string unchanged, even inside one millisecond", () => {
    expect(newestAt([])).toBeNull();
    expect(newestAt(["2026-11-15T04:00:00+00:00"])).toBe("2026-11-15T04:00:00+00:00");
    expect(newestAt(["2026-11-15T04:00:00.5+00:00", "2026-11-15T04:00:00.123+00:00"])).toBe("2026-11-15T04:00:00.5+00:00");
    expect(newestAt(["2026-11-15T04:00:00.123456+00:00", "2026-11-15T04:00:00.123789+00:00", "2026-11-15T04:00:00.123100+00:00"])).toBe("2026-11-15T04:00:00.123789+00:00");
    expect(newestAt(["2026-11-15T05:00:00+01:00", "2026-11-15T03:30:00+00:00"])).toBe("2026-11-15T05:00:00+01:00"); // 04:00Z beats 03:30Z: offsets are compared as instants
  });
});
