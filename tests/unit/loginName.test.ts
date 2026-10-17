import { describe, expect, it, vi } from "vitest";
import { decideLogin, PLACEHOLDER_EMAIL, type LoginDeps } from "@/lib/auth/login";
import { LOGIN_NAME_RE, normalizeLoginName, parseLoginInput } from "@/lib/auth/loginName";
import { auth } from "@/lib/copy/vi";
import { DEFAULT_LOGIN_NAMES, loginsFromEnv, validateLoginNames } from "../../scripts/lib/realFamilyInput";

describe("login name parsing", () => {
  it("text without @ is a login name (trimmed, lower-cased)", () => {
    expect(parseLoginInput("An")).toEqual({ kind: "name", name: "an" });
    expect(parseLoginInput("  GiaSu-Nguyen ")).toEqual({ kind: "name", name: "giasu-nguyen" });
    expect(parseLoginInput("thu-an")).toEqual({ kind: "name", name: "thu-an" });
  });

  it("text with @ is an email, kept as typed (trimmed)", () => {
    expect(parseLoginInput(" me@example.com ")).toEqual({ kind: "email", email: "me@example.com" });
    expect(parseLoginInput("a.b+c@gmail.com")).toEqual({ kind: "email", email: "a.b+c@gmail.com" });
  });

  it("blank is empty; malformed names and emails are invalid", () => {
    expect(parseLoginInput("")).toEqual({ kind: "empty" });
    expect(parseLoginInput("   ")).toEqual({ kind: "empty" });
    expect(parseLoginInput(undefined)).toEqual({ kind: "empty" });
    for (const bad of ["a", "-an", "an an", "an_an", "đăng", "x".repeat(32), "a@b", "@x.y", "a b@x.y"]) {
      expect(parseLoginInput(bad), bad).toEqual({ kind: "invalid" });
    }
  });

  it("the name rule matches the database CHECK (2–31 chars, no leading dash)", () => {
    expect(LOGIN_NAME_RE.test("ab")).toBe(true);
    expect(LOGIN_NAME_RE.test("a".repeat(31))).toBe(true);
    expect(LOGIN_NAME_RE.test("a".repeat(32))).toBe(false);
    expect(normalizeLoginName("Giasu-An")).toBe("giasu-an");
    expect(normalizeLoginName("a")).toBeNull();
  });
});

describe("decideLogin", () => {
  const deps = (over: Partial<LoginDeps> = {}) => {
    const emailForName = vi.fn(async (name: string) => (name === "an" ? "secret.parent+an@gmail.com" : null));
    const signIn = vi.fn(async (email: string, password: string) =>
      email === "secret.parent+an@gmail.com" && password === "right-password-1" ? ({ ok: true } as const) : ({ ok: false, invalid: true } as const),
    );
    return { emailForName, signIn, ...over } as LoginDeps & { emailForName: typeof emailForName; signIn: typeof signIn };
  };

  it("a known name signs in with the resolved email (resolved on the server)", async () => {
    const d = deps();
    expect(await decideLogin("An", "right-password-1", d)).toEqual({ ok: true });
    expect(d.signIn).toHaveBeenCalledWith("secret.parent+an@gmail.com", "right-password-1");
  });

  it("an email skips the name lookup", async () => {
    const d = deps();
    await decideLogin("secret.parent+an@gmail.com", "right-password-1", d);
    expect(d.emailForName).not.toHaveBeenCalled();
  });

  it("unknown name and wrong password give exactly the same answer, and neither reveals an email", async () => {
    const unknown = await decideLogin("khong-co", "whatever-pass-1", deps());
    const wrong = await decideLogin("an", "wrong-password-1", deps());
    expect(unknown).toEqual({ ok: false, error: auth.errorInvalid });
    expect(wrong).toEqual(unknown);
    expect(JSON.stringify([unknown, wrong])).not.toContain("@");
  });

  it("an unknown name still goes through a sign-in attempt with a placeholder that cannot exist", async () => {
    const d = deps();
    await decideLogin("khong-co", "whatever-pass-1", d);
    expect(d.signIn).toHaveBeenCalledTimes(1);
    expect(d.signIn).toHaveBeenCalledWith(PLACEHOLDER_EMAIL, "whatever-pass-1");
    expect(PLACEHOLDER_EMAIL.endsWith(".invalid")).toBe(true);
  });

  it("a malformed name is answered like a wrong password, without calling anything", async () => {
    const d = deps();
    expect(await decideLogin("an an", "x-password-123", d)).toEqual({ ok: false, error: auth.errorInvalid });
    expect(d.emailForName).not.toHaveBeenCalled();
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("missing login or password gets the 'missing' message", async () => {
    expect(await decideLogin("", "x", deps())).toEqual({ ok: false, error: auth.errorMissing });
    expect(await decideLogin("an", "", deps())).toEqual({ ok: false, error: auth.errorMissing });
  });

  it("a failing lookup or a non-credential sign-in failure is the generic message (never a hint about names)", async () => {
    const lookupFails = deps({ emailForName: vi.fn(async () => { throw new Error("db down"); }) });
    expect(await decideLogin("an", "x-password-123", lookupFails)).toEqual({ ok: false, error: auth.errorGeneric });
    const authDown = deps({ signIn: vi.fn(async () => ({ ok: false, invalid: false }) as const) });
    expect(await decideLogin("an", "x-password-123", authDown)).toEqual({ ok: false, error: auth.errorGeneric });
  });
});

describe("create-real-family login names (validateLoginNames)", () => {
  it("defaults: an / nguyen / giasu-an / giasu-nguyen, parent none", () => {
    const r = validateLoginNames({});
    expect(r).toEqual({ ok: true, value: DEFAULT_LOGIN_NAMES });
    expect(DEFAULT_LOGIN_NAMES).toEqual({ parent: null, studentAn: "an", studentNguyen: "nguyen", tutorAn: "giasu-an", tutorNguyen: "giasu-nguyen" });
  });

  it("blank inputs fall back to the defaults; typed ones are normalised; the parent can get one", () => {
    const r = validateLoginNames({ studentAn: "  ", tutorAn: "Co-Lan", parent: "Bo-Me" });
    expect(r.ok && r.value).toMatchObject({ studentAn: "an", tutorAn: "co-lan", parent: "bo-me", tutorNguyen: "giasu-nguyen" });
  });

  it("reports malformed and duplicate names", () => {
    const bad = validateLoginNames({ studentAn: "An An" });
    expect(!bad.ok && bad.errors.join()).toMatch(/chưa đúng dạng/);
    const dup = validateLoginNames({ tutorAn: "nguyen" });
    expect(!dup.ok && dup.errors.join()).toMatch(/trùng tên/);
  });

  it("reads LOGIN_* variables, empty string = not given", () => {
    expect(loginsFromEnv({ LOGIN_AN: "x1", LOGIN_NGUYEN: "" })).toEqual({ studentAn: "x1", studentNguyen: undefined, tutorAn: undefined, tutorNguyen: undefined, parent: undefined });
  });
});
