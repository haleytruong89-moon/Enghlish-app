import { describe, expect, it } from "vitest";
import { addDays, addWeeks, appliesFromVn, dayVn, ddmm, weekEnd, weekRangeLabel, weekStartVn, weeksBetween } from "@/lib/student/week";

describe("weekStartVn — Monday 00:00 in Asia/Ho_Chi_Minh (UTC+7)", () => {
  it("Monday 00:00 in Vietnam is Sunday 17:00 UTC: one second earlier is still the old week", () => {
    expect(weekStartVn("2026-11-15T16:59:59Z")).toBe("2026-11-09"); // Sunday 23:59:59 VN
    expect(weekStartVn("2026-11-15T17:00:00Z")).toBe("2026-11-16"); // Monday 00:00:00 VN
    expect(weekStartVn("2026-11-16T00:00:00+07:00")).toBe("2026-11-16");
    expect(weekStartVn("2026-11-15T23:59:59.999+07:00")).toBe("2026-11-09");
  });
  it("a whole week maps to its Monday; the next Monday starts the next week", () => {
    const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
    for (const d of days) expect(weekStartVn(`${d}T12:00:00+07:00`), d).toBe("2026-11-09");
    expect(weekStartVn("2026-11-16T12:00:00+07:00")).toBe("2026-11-16");
  });
  it("the new year does not start a new week by itself (01/01/2027 is a Friday)", () => {
    expect(weekStartVn("2026-12-31T16:59:59Z")).toBe("2026-12-28");
    expect(weekStartVn("2026-12-31T17:00:00Z")).toBe("2026-12-28"); // 01/01/2027 00:00 VN
    expect(weekStartVn("2027-01-03T16:59:59Z")).toBe("2026-12-28"); // Sunday 03/01 23:59 VN
    expect(weekStartVn("2027-01-03T17:00:00Z")).toBe("2027-01-04");
  });
  it("a leap day and the end of February", () => {
    expect(weekStartVn("2028-02-27T16:59:59Z")).toBe("2028-02-21"); // Sunday 27/02 23:59:59 VN
    expect(weekStartVn("2028-02-27T17:00:00Z")).toBe("2028-02-28"); // Monday 28/02 00:00 VN
    expect(weekStartVn("2028-02-29T10:00:00+07:00")).toBe("2028-02-28");
    expect(weekStartVn("2028-03-05T23:00:00+07:00")).toBe("2028-02-28");
    expect(weekStartVn("2028-03-06T00:00:00+07:00")).toBe("2028-03-06");
  });
  it("takes a Date, a number or a Postgres-style timestamp; the machine's own time zone never matters", () => {
    const ms = Date.UTC(2026, 10, 15, 17, 0, 0);
    expect(weekStartVn(new Date(ms))).toBe("2026-11-16");
    expect(weekStartVn(ms)).toBe("2026-11-16");
    expect(weekStartVn("2026-11-15 17:00:00+00")).toBe("2026-11-16");
    expect(weekStartVn("2026-11-16T00:00:00.123456+07:00")).toBe("2026-11-16");
  });
  it("a value that is not a time is refused, never turned into a week", () => {
    expect(() => weekStartVn("nonsense")).toThrow(RangeError);
    expect(() => weekStartVn(Number.NaN)).toThrow(RangeError);
    expect(() => dayVn("")).toThrow(RangeError);
  });
});

describe("dates", () => {
  it("dayVn is the Vietnam calendar day", () => {
    expect(dayVn("2026-11-15T16:59:59Z")).toBe("2026-11-15");
    expect(dayVn("2026-11-15T17:00:00Z")).toBe("2026-11-16");
  });
  it("a decision always starts the Monday AFTER the week it was taken in — also on Sunday night and on Monday 00:00", () => {
    expect(appliesFromVn("2026-11-15T14:00:00Z")).toBe("2026-11-16"); // Sunday 21:00 VN (plan example 3)
    expect(appliesFromVn("2026-11-15T16:59:59Z")).toBe("2026-11-16");
    expect(appliesFromVn("2026-11-15T17:00:00Z")).toBe("2026-11-23"); // Monday 00:00 VN: the next Monday after THIS week
    expect(appliesFromVn("2026-11-11T03:00:00Z")).toBe("2026-11-16");
  });
  it("addDays / addWeeks / weekEnd / weeksBetween across a month and a year", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-11-16", -2)).toBe("2026-11-02");
    expect(weekEnd("2026-11-09")).toBe("2026-11-15");
    expect(weeksBetween("2026-11-02", "2026-11-23")).toBe(3);
    expect(weeksBetween("2026-11-23", "2026-11-02")).toBe(-3);
    expect(weeksBetween("2026-12-28", "2027-01-04")).toBe(1);
  });
  it("labels", () => {
    expect(ddmm("2026-11-09")).toBe("09/11");
    expect(weekRangeLabel("2026-11-09")).toBe("09/11 – 15/11");
    expect(weekRangeLabel("2026-12-28")).toBe("28/12 – 03/01");
  });
});
