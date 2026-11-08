import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/learners/l1/weak" }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
const requireShell = vi.fn();
vi.mock("@/lib/shell/load", () => ({ requireShell: (...a: unknown[]) => requireShell(...a) }));

import LearnerLayout from "@/app/learners/[id]/layout";

const shell = { displayName: "Thầy", role: "tutor", memberId: "m", learners: [{ id: "l1", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null }], revisionsReady: true };

describe("app/learners/[id]/layout", () => {
  it("asks for the shell of the child in the URL, strictly", async () => {
    requireShell.mockResolvedValue({ ...shell, current: shell.learners[0] });
    const html = renderToStaticMarkup(await LearnerLayout({ params: Promise.resolve({ id: "l1" }), children: createElement("p", null, "PAGE") }));
    expect(requireShell).toHaveBeenCalledWith("l1", { strict: true });
    expect(html).toContain('data-testid="staff-shell"');
    expect(html).toContain("PAGE");
  });
  it("a student / a child outside the scope: requireShell throws (notFound) and nothing is rendered", async () => {
    requireShell.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(LearnerLayout({ params: Promise.resolve({ id: "x" }), children: null })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
