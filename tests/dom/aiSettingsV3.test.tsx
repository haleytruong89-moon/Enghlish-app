import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";
import { aiSettingsCopy } from "@/lib/copy/vi";
import type { AiSettingsView } from "@/lib/studio/types";

afterEach(cleanup);
const view = (version: string | null): AiSettingsView => ({
  enabled: true, monthlyCapUsd: 20, softCapUsd: 18, spentUsd: 1, runsMonth: 3, softReached: false, updatedAt: null,
  learners: [{ id: "l1", alias: "An", isTest: true, aiText: true, aiTextVersion: version, tutorToday: 0, tutorMonth: 0 }],
});

describe("Cài đặt AI · consent v3 (E2a)", () => {
  it("a consent given to v2 asks the parent to agree again; v3 does not", () => {
    render(<AiSettingsForm initial={view("ai-studio-tutor-v2")} />);
    expect(screen.getByTestId("ai-reconsent").textContent).toContain(aiSettingsCopy.reconsent);
    cleanup();
    render(<AiSettingsForm initial={view("ai-studio-tutor-v3")} />);
    expect(screen.queryByTestId("ai-reconsent")).toBeNull();
  });
  it("the text says the tutor is its own page, not inside works, and that questions are kept for mum and the tutor", () => {
    const text = aiSettingsCopy.points.join(" ");
    expect(text).toContain("mục riêng “Gia sư”");
    expect(text).toContain("không có trong bài làm");
    expect(text).toContain("Câu con hỏi được lưu lại");
    expect(text).not.toContain("nút “Hỏi” trong bài luyện");
  });
});
