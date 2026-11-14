import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NoteMarkMenu } from "@/components/sessions/NoteMarkMenu";
import { LessonNotes } from "@/components/review/LessonNotes";
import { absenceCopy, sessionKindCopy } from "@/lib/copy/vi";
import type { LessonNoteView } from "@/lib/review/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});
const fetchMock = (status: number, body: unknown) => {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};
const bodyOf = (f: ReturnType<typeof fetchMock>) => JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
const NOTE = "c0000000-0000-4000-8000-000000000001";
const mount = (current: "regular" | "makeup" | "not_counted" = "regular", parentNote = false) =>
  render(<NoteMarkMenu learnerId="L1" noteId={NOTE} current={current} makeupChoices={[{ id: "a1", label: "19/11 · con, không tính phí" }]} parentNote={parentNote} />);

describe("Đánh dấu một ghi chú", () => {
  it("opens with the current kind selected: Thường / Học bù / Không tính", () => {
    mount("makeup");
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    expect(screen.getByTestId("note-mark-kind-makeup").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("note-mark-kind-regular").textContent).toBe(sessionKindCopy.regular);
    expect(screen.getByTestId("note-mark-kind-not_counted").textContent).toBe(sessionKindCopy.notCounted);
    expect(screen.getByTestId("note-mark-makeup-for")).toBeTruthy();
  });
  it("Không tính needs a reason before anything is sent", () => {
    const f = fetchMock(201, { id: "m", replayed: false });
    mount();
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    fireEvent.click(screen.getByTestId("note-mark-kind-not_counted"));
    fireEvent.change(screen.getByTestId("note-mark-reason"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("note-mark-save"));
    expect(screen.getByTestId("note-mark-error").textContent).toBe(sessionKindCopy.reasonNeeded);
    expect(f).not.toHaveBeenCalled();
  });
  it("posts the kind, the absence for a makeup and the reason for Không tính", async () => {
    const f = fetchMock(201, { id: "m", replayed: false });
    mount();
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    fireEvent.click(screen.getByTestId("note-mark-kind-makeup"));
    fireEvent.change(screen.getByTestId("note-mark-makeup-for"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("note-mark-save"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/learners/L1/sessions/marks");
    expect(bodyOf(f)).toMatchObject({ note_id: NOTE, kind: "makeup", makeup_for: "a1" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    cleanup();
    const g = fetchMock(201, { id: "m", replayed: false });
    mount();
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    fireEvent.click(screen.getByTestId("note-mark-kind-not_counted"));
    fireEvent.change(screen.getByTestId("note-mark-reason"), { target: { value: "ghi nhầm em" } });
    fireEvent.click(screen.getByTestId("note-mark-save"));
    await waitFor(() => expect(g).toHaveBeenCalled());
    expect(bodyOf(g)).toMatchObject({ kind: "not_counted", reason: "ghi nhầm em" });
  });
  it("a note that already has a newer version: words, menu stays open", async () => {
    fetchMock(400, { error: "not_current" });
    mount();
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    fireEvent.click(screen.getByTestId("note-mark-save"));
    await waitFor(() => expect(screen.getByTestId("note-mark-error").textContent).toBe(absenceCopy.errors.not_current));
  });
  it("a parent's note says it never makes a session", () => {
    mount("regular", true);
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    expect(screen.getByText(sessionKindCopy.parentNoteHint)).toBeTruthy();
  });
});

const view = (over: Partial<LessonNoteView>): LessonNoteView => ({
  id: NOTE, learnerId: "L1", tutorMemberId: "m1", sessionDate: "2026-11-07", goals: "Ôn bài", observed: null, supportLevel: null, nextActions: [], practisedTargetIds: [],
  published: true, supersedesId: null, createdAt: "2026-11-07T10:00:00Z", current: true, weakTagKeys: [], messageToLearner: null, noteForParent: null, authorRole: "tutor", ...over,
});
describe("editing a note that is already a makeup", () => {
  const choices = [{ id: "a1", label: "19/11 · con, không tính phí" }, { id: "a2", label: "20/11 · con, có tính phí" }];
  it("preselects its absence; saving without a change posts nothing and keeps the link", () => {
    const f = fetchMock(201, { id: "m", replayed: false });
    render(<NoteMarkMenu learnerId="L1" noteId={NOTE} current="makeup" currentMakeupFor="a2" makeupChoices={choices} parentNote={false} />);
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    expect((screen.getByTestId("note-mark-makeup-for") as HTMLSelectElement).value).toBe("a2");
    fireEvent.click(screen.getByTestId("note-mark-save"));
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByTestId("note-mark-save")).toBeNull();
  });
  it("changing to another absence posts the new link; switching to Thường and back does not lose the preselection", async () => {
    const f = fetchMock(201, { id: "m", replayed: false });
    render(<NoteMarkMenu learnerId="L1" noteId={NOTE} current="makeup" currentMakeupFor="a2" makeupChoices={choices} parentNote={false} />);
    fireEvent.click(screen.getByTestId(`note-mark-${NOTE}`));
    fireEvent.change(screen.getByTestId("note-mark-makeup-for"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("note-mark-save"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(bodyOf(f)).toMatchObject({ kind: "makeup", makeup_for: "a1" });
  });
});

describe("the notes list with marks", () => {
  const props = { learnerId: "L1", targets: [], canWrite: false, memberId: "m9", today: "2026-11-14", minDate: "2026-07-16" };
  it("a Không tính note is struck through with its reason; a makeup note has the Học bù tag; every note has the menu", () => {
    render(<LessonNotes {...props} notes={[view({ id: "n1" }), view({ id: "n2" })]} marks={{ n1: { kind: "not_counted", reason: "ghi nhầm em" }, n2: { kind: "makeup", reason: null } }} />);
    expect(screen.getByTestId("note-not-counted-n1").textContent).toContain("ghi nhầm em");
    expect(screen.getByTestId("note-makeup-n2")).toBeTruthy();
    expect(screen.getByTestId("note-mark-n1")).toBeTruthy();
    expect(screen.getByTestId("note-mark-n2")).toBeTruthy();
  });
  it("without marks (0030 not applied) the list is exactly as before: no menu", () => {
    render(<LessonNotes {...props} notes={[view({ id: "n1" })]} />);
    expect(screen.queryByTestId("note-mark-n1")).toBeNull();
  });
});
