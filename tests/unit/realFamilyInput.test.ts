import { describe, expect, it } from "vitest";
import { checkSlotPasswords, MAX_NAME_LENGTH, passwordsFromEnv, PASSWORD_ENV, SLOTS, validateRealFamilyInput } from "../../scripts/lib/realFamilyInput";

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

describe("per-slot temporary passwords", () => {
  const pw = {
    parent: "parent-secret-001",
    studentAn: "an-secret-0000002",
    studentNguyen: "nguyen-secret-003",
    tutorAn: "tutor-an-secret-04",
    tutorNguyen: "tutor-nguyen-sec-5",
  };

  it("uses one secret name per slot", () => {
    expect(SLOTS.map((s) => PASSWORD_ENV[s]).sort()).toEqual([
      "NEW_PASSWORD_AN",
      "NEW_PASSWORD_NGUYEN",
      "NEW_PASSWORD_PARENT",
      "NEW_PASSWORD_TUTOR_AN",
      "NEW_PASSWORD_TUTOR_NGUYEN",
    ]);
    expect(passwordsFromEnv({ NEW_PASSWORD_AN: "x".repeat(12), NEW_PASSWORD_PARENT: "" })).toEqual({
      parent: undefined,
      studentAn: "x".repeat(12),
      studentNguyen: undefined,
      tutorAn: undefined,
      tutorNguyen: undefined,
    });
  });

  it("needs nothing when every account already exists", () => {
    expect(checkSlotPasswords({}, [])).toEqual([]);
  });

  it("requires a secret only for the slots that must be created", () => {
    const errors = checkSlotPasswords({ tutorAn: pw.tutorAn }, ["tutorAn", "tutorNguyen"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("NEW_PASSWORD_TUTOR_NGUYEN");
    expect(checkSlotPasswords({ tutorAn: pw.tutorAn, tutorNguyen: pw.tutorNguyen }, ["tutorAn", "tutorNguyen"])).toEqual([]);
  });

  it("needs at least 12 characters for every provided secret", () => {
    const errors = checkSlotPasswords({ tutorAn: "short", tutorNguyen: "exactly-12-ch" }, ["tutorAn", "tutorNguyen"]);
    expect(errors).toEqual(["NEW_PASSWORD_TUTOR_AN phải có ít nhất 12 ký tự."]);
    // a provided but unneeded short secret is also a mistake worth stopping for
    expect(checkSlotPasswords({ parent: "tiny" }, [])).toHaveLength(1);
  });

  it("refuses any two provided secrets that are equal (even when one slot is not created)", () => {
    const same = "the-same-password-1";
    const errors = checkSlotPasswords({ tutorAn: same, tutorNguyen: same }, ["tutorAn", "tutorNguyen"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/NEW_PASSWORD_TUTOR_AN và NEW_PASSWORD_TUTOR_NGUYEN/);
    expect(checkSlotPasswords({ ...pw, parent: pw.tutorAn }, ["tutorAn"])).toHaveLength(1);
    expect(checkSlotPasswords(pw, ["tutorAn"])).toEqual([]);
  });

  it("never echoes a password value in any message", () => {
    const all = checkSlotPasswords({ tutorAn: "short-secret", tutorNguyen: "short-secret" }, ["tutorAn", "tutorNguyen", "parent"]).join("\n");
    expect(all).not.toContain("short-secret");
  });
});
