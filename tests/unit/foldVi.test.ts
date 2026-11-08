import { describe, expect, it } from "vitest";
import { foldVi } from "@/lib/text/fold";

describe("foldVi", () => {
  it("matches without accents", () => {
    expect(foldVi("Câu điều kiện hỗn hợp")).toContain(foldVi("cau dieu kien"));
    expect(foldVi("Đảo ngữ")).toContain(foldVi("dao ngu"));
    expect(foldVi("ĐỌC HIỂU")).toContain(foldVi("doc hieu"));
    expect(foldVi("Đảo ngữ")).toBe("dao ngu");
  });
  it("folds capitals, horn/breve letters and đ", () => {
    expect(foldVi("Từ vựng")).toContain("tu vung");
    expect(foldVi("Ước lượng")).toContain("uoc luong");
    expect(foldVi("Ở ĐÂU")).toContain("o dau");
    expect(foldVi("ỨNG DỤNG")).toContain("ung dung");
  });
  it("a no-break space collapses like a space", () => {
    expect(foldVi("cau\u00a0dieu\u00a0 kien")).toBe("cau dieu kien");
  });
  it("NFC and NFD give the same output", () => {
    const s = "Câu điều kiện";
    expect(foldVi(s.normalize("NFC"))).toBe(foldVi(s.normalize("NFD")));
  });
  it("collapses and trims whitespace", () => {
    expect(foldVi("  cau   dieu \t kien  ")).toBe("cau dieu kien");
  });
});
