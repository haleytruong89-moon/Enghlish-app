import { describe, expect, it } from "vitest";
import { isDirty, snapshot, statusLine, type SaveState } from "@/lib/ui/saveStatus";
import { saveStatusCopy } from "@/lib/copy/vi";

const st = (over: Partial<SaveState> = {}): SaveState => ({ phase: "idle", savedAt: null, baseline: "a", current: "a", ...over });

describe("statusLine", () => {
  it("says nothing when idle and clean", () => expect(statusLine(st())).toBeNull());
  it("saving", () => expect(statusLine(st({ phase: "saving", current: "b" }))).toEqual({ text: "Đang lưu…", tone: "muted" }));
  it("dirty", () => expect(statusLine(st({ current: "b" }))).toEqual({ text: "● Có thay đổi chưa lưu", tone: "warn" }));
  it("dirty wins over an old 'saved'", () => expect(statusLine(st({ phase: "saved", savedAt: "2026-11-13T01:05:00Z", current: "b" }))?.text).toBe(saveStatusCopy.dirty));
  it("saved at hh:mm in Vietnam time", () => expect(statusLine(st({ phase: "saved", savedAt: "2026-11-13T01:05:00Z" }))).toEqual({ text: "✓ Đã lưu lúc 08:05", tone: "ok" }));
  it("error", () => expect(statusLine(st({ phase: "error", current: "b" }))).toEqual({ text: saveStatusCopy.error, tone: "error" }));
});

describe("snapshot / isDirty", () => {
  it("does not depend on key order", () => expect(snapshot({ a: 1, b: { c: 2, d: [1, { y: 1, x: 2 }] } })).toBe(snapshot({ b: { d: [1, { x: 2, y: 1 }], c: 2 }, a: 1 })));
  it("array order matters", () => expect(snapshot([1, 2])).not.toBe(snapshot([2, 1])));
  it("is not dirty while saving", () => expect(isDirty(st({ phase: "saving", current: "b" }))).toBe(false));
  it("is dirty when different", () => expect(isDirty(st({ current: "b" }))).toBe(true));
});
