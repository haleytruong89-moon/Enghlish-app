import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StudentTabs } from "@/components/student/desk/StudentTabs";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(cleanup);

describe("child's desk tabs with E2a", () => {
  it("before migration 0041: the four tabs, no Gia sư / Sổ tay and no 'Sắp có'", () => {
    render(<StudentTabs active="today" learnerId="l1" seenTimes={[]} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/", "/seen", "/done", "/journey"]);
    expect(screen.getByTestId("student-nav").textContent).not.toContain("Sắp có");
  });
  it("with 0041: six tabs, Gia sư and Sổ tay right after Hôm nay", () => {
    render(<StudentTabs active="tutor" learnerId="l1" seenTimes={[]} tutorReady />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/", "/tutor", "/notebook", "/seen", "/done", "/journey"]);
    expect(screen.getByTestId("nav-tutor").getAttribute("aria-current")).toBe("page");
  });
});
