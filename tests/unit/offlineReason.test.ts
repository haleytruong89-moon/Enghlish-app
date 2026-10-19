import { describe, expect, it } from "vitest";
import { backdateReasonToSend, needsBackdateReason } from "@/lib/review/offlineReason";

const base = { paper: true, date: "2026-10-18", minDate: "2026-10-17", stepNotOpen: false };

describe("the reason for an earlier date (OfflineForm)", () => {
  it("is needed only for paper work dated before minDate, or after the server said the step was not open", () => {
    expect(needsBackdateReason(base)).toBe(false);
    expect(needsBackdateReason({ ...base, date: "2026-10-16" })).toBe(true);
    expect(needsBackdateReason({ ...base, stepNotOpen: true })).toBe(true);
    expect(needsBackdateReason({ ...base, paper: false, date: "2026-10-01", stepNotOpen: true })).toBe(false);
  });
  it("a reason typed earlier is NOT sent once the date no longer needs it (the form resets stepNotOpen on every date change)", () => {
    const typed = { ...base, reason: "Nhập từ phiếu giấy pilot" };
    expect(backdateReasonToSend({ ...typed, date: "2026-10-10" })).toBe("Nhập từ phiếu giấy pilot");
    expect(backdateReasonToSend({ ...typed, date: "2026-10-18" })).toBeNull(); // date moved back to a normal day
    expect(backdateReasonToSend({ ...typed, stepNotOpen: false })).toBeNull(); // the flag was reset by the date change
    expect(backdateReasonToSend({ ...typed, stepNotOpen: true })).toBe("Nhập từ phiếu giấy pilot");
    expect(backdateReasonToSend({ ...typed, paper: false, date: "2026-10-10" })).toBeNull();
  });
  it("an empty reason is never sent", () => {
    expect(backdateReasonToSend({ ...base, date: "2026-10-10", reason: "   " })).toBeNull();
  });
  it("the form resets the 'step not open' flag when the date or the kind of work changes", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/review/OfflineForm.tsx", "utf8");
    expect(src).toMatch(/function changeDate\(value: string\) \{\s+setDate\(value\);\s+setStepNotOpen\(false\);/);
    expect(src).toMatch(/function changeProvenance\([^)]*\) \{\s+setProvenance\(value\);\s+setStepNotOpen\(false\);/);
    expect(src).not.toContain("onChange={(e) => setDate(");
  });
});
