import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportConfirm } from "@/components/import/ImportConfirm";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { IntakeCard } from "@/components/workdesk/IntakeCard";
import { TeachingNotesCard } from "@/components/workdesk/TeachingNotesCard";
import { saveStatusCopy } from "@/lib/copy/vi";
import type { ImportPageData } from "@/lib/import/shape";
import type { ReadPayload } from "@/lib/import/types";
import type { IntakeView, TeachingNotesView } from "@/lib/workdesk/types";
import { fixtureMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const L = "b0000000-0000-4000-8000-000000000001";
const status = () => screen.getByTestId("save-status").textContent;
const okFetch = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, id: "n1", template_id: "t1" }), { status: 200, headers: { "content-type": "application/json" } })));

describe("save status on the adult forms", () => {
  it("TeachingNotesCard: editing → unsaved; save → 'Đã lưu lúc'", async () => {
    okFetch();
    const view: TeachingNotesView = { fields: { focus: null, explain: null, errors: null, avoid: null }, updatedAt: null };
    render(<TeachingNotesCard learnerId={L} alias="Nguyên" view={view} canEdit />);
    fireEvent.click(screen.getByTestId("notes-edit"));
    expect(status()).toBe("");
    fireEvent.change(document.getElementById("tn_focus")!, { target: { value: "Đảo ngữ" } });
    expect(status()).toBe(saveStatusCopy.dirty);
    fireEvent.click(screen.getByTestId("notes-save"));
    await waitFor(() => expect(status()).toMatch(/^✓ Đã lưu lúc \d{2}:\d{2}$/));
  });

  it("IntakeCard: editing → unsaved; save → 'Đã lưu lúc'", async () => {
    okFetch();
    const view: IntakeView = { goals: [], strengths: {}, weaknesses: {}, note: "", at: "2026-11-01T00:00:00Z", authorName: "Cô Lan" };
    render(<IntakeCard learnerId={L} view={view} canEdit domains={[{ key: "grammar", name: "Ngữ pháp" }]} />);
    fireEvent.click(screen.getByTestId("intake-edit"));
    expect(status()).toBe("");
    fireEvent.change(document.getElementById("in_s_grammar")!, { target: { value: "x" } });
    expect(status()).toBe(saveStatusCopy.dirty);
    fireEvent.click(screen.getByTestId("intake-save"));
    await waitFor(() => expect(status()).toMatch(/^✓ Đã lưu lúc/));
  });

  it("SessionNoteForm: typing → unsaved; save → 'Đã lưu lúc'", async () => {
    okFetch();
    render(<SessionNoteForm learnerId={L} tags={[]} map={fixtureMap()} skills={[]} due={[]} previous={null} today="2026-11-13" minDate="2026-06-19" />);
    expect(status()).toBe("");
    const studied = document.querySelector("textarea, input[type=text]") as HTMLElement;
    fireEvent.change(studied, { target: { value: "Đảo ngữ" } });
    expect(status()).toBe(saveStatusCopy.dirty);
    fireEvent.click(screen.getByTestId("session-save"));
    await waitFor(() => expect(status()).toMatch(/^✓ Đã lưu lúc/));
  });

  const payload: ReadPayload = {
    items: [{ n: 1, part: "A", student_answer: "B", key_answer: "B", tag: "cum-dong-tu", out_of_app: false, confidence: "high", result: "correct" }],
  };
  const data: ImportPageData = {
    import: { id: "i1", learnerId: L, trackId: "B", title: "Progress Test", takenOn: "2026-10-23", supportLevel: "tu_lam", status: "draft", payload, errorCode: null, workFileId: "w", keyFileId: "k", templateId: null, updatedAt: "2026-11-08 03:00:00+00", stale: false },
    context: { tags: [{ key: "cum-dong-tu", label: "Cụm động từ", domain: null, group: null, reading: false }] },
    is_tutor: true,
  };
  it("ImportConfirm: marking a row → unsaved (the rows live only in the browser); confirm → 'Đã lưu lúc'", async () => {
    okFetch();
    render(<ImportConfirm data={data} learnerId={L} />);
    expect(status()).toBe("");
    fireEvent.click(screen.getByTestId("import-mark-1-incorrect"));
    expect(status()).toBe(saveStatusCopy.dirty);
    fireEvent.click(screen.getByTestId("import-confirm-btn"));
    await waitFor(() => expect(status()).toMatch(/^✓ Đã lưu lúc/));
  });
});
