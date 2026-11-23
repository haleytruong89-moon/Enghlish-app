import { describe, expect, it } from "vitest";
import { pickVoice } from "@/lib/notebook/voice";

const v = (lang: string, localService: boolean, name = lang) => ({ lang, localService, name });

describe("speech voice (L5: on the device only)", () => {
  it("prefers the accent among local voices", () => {
    expect(pickVoice([v("en-US", true), v("en-GB", true)], "uk")?.lang).toBe("en-GB");
    expect(pickVoice([v("en-GB", true), v("en_US", true)], "us")?.lang).toBe("en_US");
  });
  it("never a network voice, even when it is the only one with the accent", () => {
    expect(pickVoice([v("en-GB", false, "Google UK"), v("en-AU", true)], "uk")?.lang).toBe("en-AU");
    expect(pickVoice([v("en-GB", false)], "uk")).toBeNull();
  });
  it("no English voice → null (the button is hidden)", () => {
    expect(pickVoice([v("vi-VN", true)], "us")).toBeNull();
    expect(pickVoice([], "uk")).toBeNull();
  });
});
