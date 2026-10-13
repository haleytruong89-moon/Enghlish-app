import { describe, expect, it } from "vitest";
import { formatScore, learnerWithTrack, LEVEL_ORDER, levelLabels, modeLabels } from "@/lib/copy/vi";
import { allowRealLearners } from "@/lib/env";
import { safeColor, visibleLearners, type LearnerSummary } from "@/lib/home/visible";

describe("copy (UX_COPY_GUIDE v0.1)", () => {
  it("scores always show number, denominator and words; NULL differs from 0", () => {
    expect(formatScore(3)).toBe("3/4 · Đạt yêu cầu");
    expect(formatScore(0)).toBe("0/4 · Chưa thể hiện");
    expect(formatScore(null)).toBe("Bài này không có cơ hội thể hiện");
  });

  it("has the 5 level names in order", () => {
    expect(LEVEL_ORDER.map((s) => levelLabels[s].label)).toEqual([
      "Chưa đủ bài để đánh giá",
      "Làm được khi có gợi ý",
      "Đang tiến bộ",
      "Tự làm được",
      "Vận dụng được",
    ]);
  });

  it("mode names differ for students and staff", () => {
    expect(modeLabels.INDEPENDENT_CHECK.student).toBe("Bài tự làm — lần này chưa có gợi ý");
    expect(modeLabels.INDEPENDENT_CHECK.staff).toBe("Bài tự làm (không gợi ý)");
  });

  it("track label format", () => {
    expect(learnerWithTrack("An", "A")).toBe("An · Track A");
    expect(learnerWithTrack("Nguyên", "B")).toBe("Nguyên · Track B");
  });
});

describe("ALLOW_REAL_LEARNERS", () => {
  it("only the exact string 'true' enables real learners", () => {
    expect(allowRealLearners({})).toBe(false);
    expect(allowRealLearners({ ALLOW_REAL_LEARNERS: "false" })).toBe(false);
    expect(allowRealLearners({ ALLOW_REAL_LEARNERS: "TRUE " })).toBe(false);
    expect(allowRealLearners({ ALLOW_REAL_LEARNERS: "true" })).toBe(true);
  });

  const rows: LearnerSummary[] = [
    { id: "2", alias: "Nguyên", trackId: "B", status: "active", isTest: false, color: "#2F5D9E" },
    { id: "1", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: "#9A4A15" },
  ];

  it("hides non-test learners unless allowed, and sorts by track", () => {
    expect(visibleLearners(rows, false).map((l) => l.id)).toEqual(["1"]);
    expect(visibleLearners(rows, true).map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("only accepts #RRGGBB colours", () => {
    expect(safeColor("#9A4A15")).toBe("#9A4A15");
    expect(safeColor("red;background:url(x)")).toBe("#2B5D4F");
    expect(safeColor(null)).toBe("#2B5D4F");
  });
});
