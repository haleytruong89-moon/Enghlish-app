import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotebookList } from "@/components/student/notebook/NotebookList";
import type { NotebookRow } from "@/lib/student/notebook";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const row = (headword: string, state: "active" | "removed" = "active", meaning = "nghĩa"): NotebookRow => ({ itemId: `i-${headword}`, cardId: `c-${headword}`, headword, meaning, savedAt: "2026-11-23T03:00:00Z", state });

describe("Sổ tay · Từ vựng", () => {
  it("filter on the device; the count is a count of words in data-count=work; a row opens the card", () => {
    render(<NotebookList rows={[row("make", "active", "làm ra"), row("volcano", "active", "núi lửa"), row("erupt", "removed")]} />);
    expect(document.querySelector('[data-count="work"]')?.textContent).toBe("2");
    fireEvent.change(screen.getByTestId("notebook-filter"), { target: { value: "núi" } });
    expect(screen.queryByTestId("nb-make")).toBeNull();
    expect(screen.getByTestId("nb-volcano").querySelector("a")?.getAttribute("href")).toBe("/tutor/card/c-volcano?from=notebook");
  });
  it("remove asks first, then folds under Đã bỏ (n); Thêm lại brings it back", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: init?.body ?? "" });
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    render(<NotebookList rows={[row("make")]} />);
    fireEvent.click(screen.getByTestId("nb-remove-make"));
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByTestId("nb-yes-make"));
    await waitFor(() => expect(screen.getByTestId("notebook-removed").textContent).toContain("Đã bỏ (1)"));
    expect(calls[0]).toEqual({ url: "/api/student/notebook/i-make", body: JSON.stringify({ action: "remove" }) });
    fireEvent.click(screen.getByTestId("nb-restore-make"));
    await waitFor(() => expect(screen.getByTestId("nb-make")).toBeTruthy());
  });
  it("empty notebook says where words come from", () => {
    render(<NotebookList rows={[]} />);
    expect(screen.getByTestId("notebook-empty").textContent).toContain("Gia sư");
  });
});
