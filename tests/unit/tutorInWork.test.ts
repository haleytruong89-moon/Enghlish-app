import { describe, expect, it } from "vitest";
import { tutorInWorkEnabled } from "@/lib/tutor/config";
import { tutorCopy } from "@/lib/copy/vi";

describe("TUTOR_IN_WORK (parent, 22/11): no tutor inside a work unless the setting is exactly on", () => {
  it("is off when unset, empty or anything but 'on'", () => {
    for (const v of [undefined, "", "off", "ON", "true", "1", "yes"]) expect(tutorInWorkEnabled({ TUTOR_IN_WORK: v })).toBe(false);
  });
  it("is on for 'on' (spaces trimmed)", () => {
    expect(tutorInWorkEnabled({ TUTOR_IN_WORK: "on" })).toBe(true);
    expect(tutorInWorkEnabled({ TUTOR_IN_WORK: " on " })).toBe(true);
  });
  it("a tab left open from before gets a plain message, not 'Mạng chập chờn'", () => {
    expect(tutorCopy.errors.tutor_off).toBeTruthy();
    expect(tutorCopy.errors.tutor_off).not.toBe(tutorCopy.errors.network);
  });
});
