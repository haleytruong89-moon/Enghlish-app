import { describe, expect, it } from "vitest";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import {
  familyIdOf,
  maskEmail,
  MIN_PASSWORD_LENGTH,
  CHANGED_MARKER,
  RESET_TEXT,
  SENDING_MARKER,
  resolveKind,
  roleLabel,
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
  it("accepts a short login and normalises case/space", () => {
    const r = validateResetInput({ login: "  An ", password: PW, family: "real" });
    expect(r).toEqual({ ok: true, value: { login: "an", kind: "short", password: PW, family: "real", familyId: REAL_FAMILY_ID } });
  });
  it("accepts an email (lower-cased) and the test family", () => {
    const r = validateResetInput({ login: "Ha.Ley@Gmail.com", password: PW, family: "test" });
    expect(r).toEqual({ ok: true, value: { login: "ha.ley@gmail.com", kind: "email", password: PW, family: "test", familyId: TEST_FAMILY_ID } });
  });
  it("requires the family: no default when it is empty or missing", () => {
    expect(validateResetInput({ login: "an", password: PW, family: "" })).toEqual({ ok: false, errors: [RESET_TEXT.familyMissing] });
    expect(validateResetInput({ login: "an", password: PW, family: "  " })).toEqual({ ok: false, errors: [RESET_TEXT.familyMissing] });
    expect(validateResetInput({ login: "an", password: PW })).toEqual({ ok: false, errors: [RESET_TEXT.familyMissing] });
  });
  it("rejects a password with leading or trailing whitespace", () => {
    for (const pw of [" " + PW, PW + " ", PW + "\n", "\t" + PW]) {
      expect(validateResetInput({ login: "an", password: pw, family: "real" }), JSON.stringify(pw)).toEqual({ ok: false, errors: [RESET_TEXT.passwordSpaces] });
    }
    // spaces inside are fine
    expect(validateResetInput({ login: "an", password: "correct horse battery", family: "real" }).ok).toBe(true);
  });
  it("rejects a password shorter than 12 characters, accepts exactly 12", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validateResetInput({ login: "an", password: "a".repeat(11), family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an", password: "", family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an", family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.passwordShort] });
    expect(validateResetInput({ login: "an", password: "a".repeat(12), family: "real" }).ok).toBe(true);
  });
  it("rejects an empty or blank login", () => {
    expect(validateResetInput({ login: "", password: PW, family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
    expect(validateResetInput({ login: "   ", password: PW, family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
    expect(validateResetInput({ password: PW, family: "real" })).toEqual({ ok: false, errors: [RESET_TEXT.loginMissing] });
  });
  it("rejects a malformed short name or email", () => {
    for (const login of ["a", "-an", "an nguyen", "AN$", "a@", "@b.vn", "a b@c.vn"]) {
      expect(validateResetInput({ login, password: PW, family: "real" }), login).toEqual({ ok: false, errors: [RESET_TEXT.loginInvalid] });
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
      "Đã đặt lại mật khẩu cho học sinh (ha***@gmail.com). Lưu ý: tài khoản dùng chung Study Launcher nên mật khẩu Launcher cũng đổi. Xóa secret RESET_PASSWORD sau khi dùng.",
    );
  });
});

describe("roleLabel", () => {
  it("shows roles in Vietnamese and leaves an unknown role as is", () => {
    expect(roleLabel("parent")).toBe("phụ huynh");
    expect(roleLabel("tutor")).toBe("gia sư");
    expect(roleLabel("student")).toBe("học sinh");
    expect(roleLabel("other")).toBe("other");
  });
});

describe("marker lines the workflow greps for", () => {
  it("start with the exact words the workflow looks for", () => {
    expect(SENDING_MARKER.startsWith("Đang gửi yêu cầu đổi mật khẩu")).toBe(true);
    expect(CHANGED_MARKER.startsWith("Đã đổi mật khẩu")).toBe(true);
    // the final success line must NOT look like the "changed" marker (it is printed only after the commit)
    expect(successText("tutor", "x***@y.vn").startsWith("Đã đổi mật khẩu")).toBe(false);
  });
});
