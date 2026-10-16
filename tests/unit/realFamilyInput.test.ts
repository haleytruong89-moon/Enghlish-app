import { describe, expect, it } from "vitest";
import { checkTempPassword, MAX_NAME_LENGTH, validateRealFamilyInput } from "../../scripts/lib/realFamilyInput";

const good = {
  parentEmail: "bo.me@example.com",
  anEmail: "an@example.com",
  nguyenEmail: "nguyen@example.com",
  tutorAnEmail: "co.lan@example.com",
  tutorAnName: "Cô Lan",
  tutorNguyenEmail: "thay.minh@example.com",
  tutorNguyenName: "Thầy Minh",
};

describe("validateRealFamilyInput", () => {
  it("accepts a complete input and normalises it (trim, lower-case emails, collapse spaces in names)", () => {
    const r = validateRealFamilyInput({
      ...good,
      parentEmail: "  Bo.Me@Example.COM ",
      tutorAnName: "  Cô   Lan ",
    });
    expect(r).toEqual({ ok: true, value: { ...good, tutorAnName: "Cô Lan" } });
  });

  it("reports every missing field at once", () => {
    const r = validateRealFamilyInput({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(7);
  });

  it.each(["not-an-email", "a@b", "a b@example.com", "@example.com", "a@@example.com", "a@example..com", "a@.example.com"])(
    "rejects the malformed email %j",
    (bad) => {
      const r = validateRealFamilyInput({ ...good, anEmail: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual(["email của An không đúng dạng email."]);
    },
  );

  it("requires the five emails to be different, ignoring case and spaces", () => {
    const r = validateRealFamilyInput({ ...good, tutorNguyenEmail: " CO.LAN@example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(["5 email phải khác nhau (mỗi người một tài khoản riêng)."]);
  });

  it("limits the tutor names (length, control characters)", () => {
    const long = validateRealFamilyInput({ ...good, tutorAnName: "x".repeat(MAX_NAME_LENGTH + 1) });
    expect(long.ok).toBe(false);
    const ctrl = validateRealFamilyInput({ ...good, tutorNguyenName: "Thầy\u0007Minh" });
    expect(ctrl.ok).toBe(false);
    const edge = validateRealFamilyInput({ ...good, tutorAnName: "x".repeat(MAX_NAME_LENGTH) });
    expect(edge.ok).toBe(true);
  });
});

describe("checkTempPassword", () => {
  it("is not needed when every account already exists", () => {
    expect(checkTempPassword(undefined, 0)).toBeNull();
  });
  it("is required, with at least 12 characters, when some account must be created", () => {
    expect(checkTempPassword(undefined, 1)).toMatch(/NEW_ACCOUNT_TEMP_PASSWORD/);
    expect(checkTempPassword("short", 2)).toMatch(/12/);
    expect(checkTempPassword("exactly-12-ch", 2)).toBeNull();
  });
  it("never echoes the password in its message", () => {
    expect(checkTempPassword("short-secret", 1) ?? "").not.toContain("short-secret");
  });
});
