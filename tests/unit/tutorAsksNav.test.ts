import { describe, expect, it } from "vitest";
import { buildNav } from "@/lib/shell/nav";
import { activeFor } from "@/lib/shell/paths";

describe("Con hỏi Gia sư in the adults' left column (E2a)", () => {
  it("is a child of Hồ sơ học sinh for parent and tutor; its pages light that entry", () => {
    for (const role of ["parent", "tutor"] as const) {
      const profile = buildNav(role, "l1", { revisionsReady: false }).sections.find((s) => s.key === "profile")!;
      expect(profile.children.find((c) => c.key === "tutorAsks")).toEqual({ key: "tutorAsks", label: "Con hỏi Gia sư", href: "/learners/l1/tutor-asks" });
    }
    expect(activeFor("/learners/l1/tutor-asks")).toMatchObject({ section: "profile", child: "tutorAsks", screen: "Con hỏi Gia sư" });
    expect(activeFor("/learners/l1/tutor-asks/card/c1")).toMatchObject({ section: "profile", child: "tutorAsks" });
  });
});
