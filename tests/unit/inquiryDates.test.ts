import { describe, expect, it } from "vitest";
import { addDays, dateWindow, daysBetween, defaultDueOn, isWithinWindow, todayVn } from "@/lib/inquiries/dates";

describe("inquiry date helpers (Asia/Ho_Chi_Minh)", () => {
  it("today is the Vietnamese date, which runs 7 hours ahead of UTC", () => {
    expect(todayVn(new Date("2026-10-14T08:00:00Z"))).toBe("2026-10-14");
    expect(todayVn(new Date("2026-10-14T16:59:59Z"))).toBe("2026-10-14");
    expect(todayVn(new Date("2026-10-14T17:00:00Z"))).toBe("2026-10-15");
    expect(todayVn(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });

  it("adds days across month and year ends; counts days between", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-19", "2026-10-25")).toBe(6);
    expect(daysBetween("2026-10-25", "2026-10-19")).toBe(-6);
  });

  it("the window is [today - 7, today + 120]", () => {
    const now = new Date("2026-10-14T08:00:00Z");
    expect(dateWindow(now)).toEqual({ min: "2026-10-07", max: "2027-02-11" });
    expect(isWithinWindow("2026-10-07", now)).toBe(true);
    expect(isWithinWindow("2026-10-06", now)).toBe(false);
    expect(isWithinWindow("2027-02-11", now)).toBe(true);
    expect(isWithinWindow("2027-02-12", now)).toBe(false);
  });

  it("the suggested due date: the template's own end date while it is ahead, otherwise a same-length week from today", () => {
    const now = new Date("2026-10-14T08:00:00Z");
    expect(defaultDueOn("2026-10-19", "2026-10-25", now)).toBe("2026-10-25");
    expect(defaultDueOn("2026-10-14", "2026-10-14", now)).toBe("2026-10-14"); // ends today: still current
    expect(defaultDueOn("2026-10-05", "2026-10-11", now)).toBe("2026-10-20"); // week passed: today + 6
    expect(defaultDueOn("2026-06-01", "2026-06-02", now)).toBe("2026-10-15"); // long past, 2-day template: today + 1
    expect(defaultDueOn("2028-01-01", "2028-01-07", now)).toBe("2027-02-11"); // too far ahead: clamped to the window
  });
});
