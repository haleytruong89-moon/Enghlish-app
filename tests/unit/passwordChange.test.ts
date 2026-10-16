import { describe, expect, it } from "vitest";
import { passwordChangeErrorText, validateNewPassword } from "@/lib/auth/passwordChange";
import { account } from "@/lib/copy/vi";

describe("validateNewPassword", () => {
  it("accepts 12+ characters typed twice the same", () => {
    expect(validateNewPassword("exactly-12-ch", "exactly-12-ch")).toEqual({ ok: true });
    expect(validateNewPassword("a".repeat(12), "a".repeat(12))).toEqual({ ok: true });
  });
  it("rejects fewer than 12 characters (checked before the match)", () => {
    expect(validateNewPassword("short", "short")).toEqual({ ok: false, error: account.errorShort });
    expect(validateNewPassword("a".repeat(11), "b")).toEqual({ ok: false, error: account.errorShort });
    expect(validateNewPassword("", "")).toEqual({ ok: false, error: account.errorShort });
  });
  it("rejects two different entries", () => {
    expect(validateNewPassword("a".repeat(12), "a".repeat(11) + "b")).toEqual({ ok: false, error: account.errorMismatch });
  });
  it("does not trim: spaces count as characters", () => {
    expect(validateNewPassword(" ".repeat(12), " ".repeat(12))).toEqual({ ok: true });
  });
});

describe("passwordChangeErrorText", () => {
  it("maps known Supabase errors to friendly Vietnamese", () => {
    expect(passwordChangeErrorText({ code: "same_password" })).toBe(account.errorSame);
    expect(passwordChangeErrorText({ code: "weak_password" })).toBe(account.errorWeak);
    expect(passwordChangeErrorText({ code: "session_not_found" })).toBe(account.errorSession);
    expect(passwordChangeErrorText({ status: 401 })).toBe(account.errorSession);
    expect(passwordChangeErrorText({ code: "something_else", status: 500 })).toBe(account.errorGeneric);
    expect(passwordChangeErrorText(null)).toBe(account.errorGeneric);
  });
});
