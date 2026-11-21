import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiscardedDrafts } from "@/components/studio/DiscardedDrafts";
import { studioCopy } from "@/lib/copy/vi";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("Bản nháp đã bỏ", () => {
  it("nothing when there is none", () => {
    render(<DiscardedDrafts drafts={[]} />);
    expect(screen.queryByTestId("discarded-drafts")).toBeNull();
  });

  it("Khôi phục asks the server for a copy and opens it", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: "new1" }) }));
    vi.stubGlobal("fetch", f);
    render(<DiscardedDrafts drafts={[{ id: "old1", title: "Word formation (M–P)", updatedAt: "2026-11-20T07:48:00Z" }]} />);
    expect(screen.getByTestId("discarded-drafts").textContent).toContain(studioCopy.discardedTitle(1));
    expect(screen.getByTestId("discarded-drafts").textContent).toContain("Word formation (M–P)");
    fireEvent.click(screen.getByTestId("restore-old1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/studio/drafts/new1"));
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe("/api/studio/drafts/old1/restore");
  });
});
