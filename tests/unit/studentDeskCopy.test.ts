import { describe, expect, it } from "vitest";
import { studentDeskCopy } from "@/lib/copy/vi";

const strings = (): string[] => {
  const all: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(v);
    else if (typeof v === "function") all.push(String((v as (...a: never[]) => unknown)(...(["x", "y", 2] as never[]))));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(studentDeskCopy);
  return all;
};

describe("studentDeskCopy (what the child reads on Hôm nay / Đã xem / Đã làm)", () => {
  it("no right / wrong, no percentage, no streak or ranking; 'điểm' only to say there is none; never a hard-coded 'cô'", () => {
    const all = strings();
    expect(all.length).toBeGreaterThan(60);
    for (const s of all) {
      expect(s, s).not.toMatch(/đúng|sai\b|%|streak|chuỗi|xếp hạng|thắng|chính xác|quá hạn|kỹ năng/i);
      expect(s, s).not.toMatch(/điểm/i);
      expect(s.replace(/thầy\/cô/gi, ""), s).not.toMatch(/(^|[^\p{L}])(cô|thầy)(?!\p{L})/iu);
    }
  });
  it("the tab names are the ones the parent approved (the 'Đã xem' tab, not 'Cô đã xem')", () => {
    expect(studentDeskCopy.tabs).toEqual({ today: "Hôm nay", seen: "Đã xem", done: "Đã làm", journey: "Hành trình" });
  });
});
