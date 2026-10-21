import { describe, expect, it } from "vitest";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import {
  familyIdOf,
  maskEmail,
  MIN_PASSWORD_LENGTH,
  RESET_TEXT,
  resolveKind,
  successText,
  validateResetInput,
} from "../../scripts/lib/resetPassword";
import { TEST_FAMILY_ID } from "../../scripts/lib/seed";

const PW = "a-long-enough-pw";

describe("resolveKind", () => {
  it("an @ means email, anything else is a short login name", () => {
    expect(resolveKind("an")).toBe("short");
    expect(resolveKind("giasu-nguyen")).toBe("short");
    expect(resolveKind("ha@gmail.com")).toBe("email");
  });
});

describe("maskEmail", () => {
  it("keeps two characters of the local part and the domain", () => {
    expect(maskEmail("haley@gmail.com")).toBe("ha***@gmail.com");
  });
  it("keeps one character when the local part is very short, never the whole thing", () => {
    expect(maskEmail("ab@x.vn")).toBe("a***@x.vn");
    expect(maskEmail("a@x.vn")).toBe("a***@x.vn");
  });
  it("never leaks the local part and masks a value that is not an email", () => {
    expect(maskEmail("hanh.truong@gmail.com")).not.toContain("hanh.truong");
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@x.vn")).toBe("***");
  });
});

describe("familyIdOf", () => {
  it("maps real and test to the fixed family ids", () => {
    expect(familyIdOf("real")).toBe(REAL_FAMILY_ID);
    expect(familyIdOf("test")).toBe(TEST_FAMILY_ID);
    expect(REAL_FAMILY_ID).not.toBe(TEST_FAMILY_ID);
  });
});

describe("validateResetInput", () => {
  it("accepts a short login, defaults the family to real and normalises case/space", () => {
    const r = validateResetInput({ login: "  An ", password: PW });
    expect(r).toEqual({ ok: true, value: { login: "an", kind: "short", password: PW, family: "real", familyId: REAL_FAMILY_ID } });
  });
  it("accepts an email (lower-cased) and the test family", () => {
    const r = validateResetInput({ login: "Ha.Ley@Gmail.com", password: PW, family: "test" });
    expect(r).toEqual({ ok: true, value: { login: "ha.ley@gmail.com", kind: "email", password: PW, family: "test", familyId: TEST_FAMILY_ID } });
  });
  it("treats an empty family as real", () => {
    const r = validateResetInput({ login: "an", password: PW, family: "" });
    expect(r.ok && r.value.family).toBe("real");
  });
  it("rejects a password shorter than 12 characters, accepts exactly 12", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validateResetInput({ login: "an", password: "a".repeat(11) })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an", password: "" })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an" })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an", password: "a".repeat(12) }).ok).toBe(true);
  });
  it("rejects an empty or blank login", () => {
    expect(validateResetInput({ login: "", password: PW })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
    expect(validateResetInput({ login: "   ", password: PW })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
    expect(validateResetInput({ password: PW })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
  });
  it("rejects a malformed short name or email", () => {
    for (const login of ["a", "-an", "an nguyen", "AN$", "a@", "@b.vn", "a b@c.vn"]) {
      expect(validateResetInput({ login, password: PW }), login).toEqual({ ok: false, errors: [RESET_TEXT.loginInvalid] });
    }
  });
  it("rejects an unknown family", () => {
    expect(validateResetInput({ login: "an", password: PW, family: "prod" })).toEqual({ ok: false, errors: [RESET_TEXT.familyInvalid] });
  });
  it("reports every problem at once and never echoes the password", () => {
    const r = validateResetInput({ login: "", password: "short", family: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(3);
      expect(r.errors.join("\n")).not.toContain("short");
    }
  });
});

describe("successText", () => {
  it("names the role and the masked email, warns about Launcher, and reminds to delete the secret", () => {
    const t = successText("student", "ha***@gmail.com");
    expect(t).toBe(
      "Đã đặt lại mật khẩu cho student (ha***@gmail.com). Lưu ý: tài khoản dùng chung Study Launcher nên mật khẩu Launcher cũng đổi. Xóa secret RESET_PASSWORD sau khi dùng.",
    );
  });
});
