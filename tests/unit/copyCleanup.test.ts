import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import * as copy from "@/lib/copy/vi";

describe("copy cleanup (UX round 3, U27)", () => {
  it("loadingCopy is gone and nothing refers to it", () => {
    expect("loadingCopy" in copy).toBe(false);
    const hits = execSync("grep -rl loadingCopy app components lib || true", { encoding: "utf8" }).trim();
    expect(hits).toBe("");
  });
  it("busyCopy stays", () => {
    expect(copy.busyCopy.saving).toBe("Đang lưu…");
  });
});
