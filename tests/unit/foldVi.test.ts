import { describe, expect, it } from "vitest";
import { foldVi } from "@/lib/text/fold";
import { applySameAsLast } from "@/lib/tutorwork/sameAsLast";

describe("foldVi", () => {
  it("matches without accents", () => {
    expect(foldVi("Câu điều kiện hỗn hợp")).toContain(foldVi("cau dieu kien"));
    expect(foldVi("Đảo ngữ")).toContain(foldVi("dao ngu"));
    expect(foldVi("ĐỌC HIỂU")).toContain(foldVi("doc hieu"));
    expect(foldVi("Đảo ngữ")).toBe("dao ngu");
  });
  it("NFC and NFD give the same output", () => {
    const s = "Câu điều kiện";
    expect(foldVi(s.normalize("NFC"))).toBe(foldVi(s.normalize("NFD")));
  });
  it("collapses and trims whitespace", () => {
    expect(foldVi("  cau   dieu \t kien  ")).toBe("cau dieu kien");
  });
});

describe("applySameAsLast", () => {
  const prev = { practisedTargetIds: ["a", "b", "gone"], weakTagKeys: ["t1", "t2", "t3", "t4", "x"] };
  it("drops skills and tags that are no longer available, caps weak points at 3, reports skipped", () => {
    const r = applySameAsLast(prev, ["a", "b", "c"], ["t1", "t2", "t3", "t4"]);
    expect(r.practised).toEqual(["a", "b"]);
    expect(r.weak).toEqual(["t1", "t2", "t3"]);
    expect(r.skippedSkills).toBe(1);
    expect(r.skippedWeak).toBe(2); // x unavailable, t4 over the cap
  });
  it("is empty when nothing is available", () => {
    expect(applySameAsLast(prev, [], [])).toMatchObject({ practised: [], weak: [], skippedSkills: 3, skippedWeak: 5 });
  });
});
