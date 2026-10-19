import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Signing out must only end this device's session (see app/auth/signout/route.ts).
describe("sign-out route", () => {
  it("uses scope local, never the global default", () => {
    const src = readFileSync("app/auth/signout/route.ts", "utf8");
    expect(src).toMatch(/signOut\(\{\s*scope:\s*"local"\s*\}\)/);
    expect(src).not.toMatch(/signOut\(\)/);
  });
});
