import { describe, expect, it } from "vitest";
import { passageItemRanges } from "@/lib/studio/passageUse";

const it_ = (n: number, passage_ref: string | null) => ({ n, passage_ref });

describe("passageItemRanges", () => {
  it("joins runs of questions and keeps single ones", () => {
    const items = [it_(3, "P1"), it_(1, "P1"), it_(2, "P1"), it_(4, null), it_(7, "P1"), it_(9, "P1"), it_(10, "P1"), it_(8, "P2")];
    expect(passageItemRanges(items, "P1")).toBe("1–3, 7, 9–10");
    expect(passageItemRanges(items, "P2")).toBe("8");
    expect(passageItemRanges(items, "P3")).toBe("");
  });
});
