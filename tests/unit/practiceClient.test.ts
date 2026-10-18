import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const put = vi.fn();
vi.mock("@/lib/tutorwork/client", () => ({ postJson: (...a: unknown[]) => post(...a) }));
vi.mock("@/lib/storage/clientUpload", () => ({ putToSignedUrl: (...a: unknown[]) => put(...a) }));

import { assignPage, practiceStudent } from "@/lib/copy/vi";
import { nextAttempt, practiceErrorText, uploadAll, type UploadCache } from "@/lib/practice/client";
import type { Prepared } from "@/lib/storage/clientUpload";

const file = (name: string): Prepared => ({ blob: new Blob(["x"]), mime: "image/png", bytes: 1, name });

beforeEach(() => {
  post.mockReset();
  put.mockReset();
});

describe("retry after a lost answer: only the failed files are sent again", () => {
  it("keeps what is already in storage; a second PUT to a used one-time link is never made", async () => {
    const a = file("a");
    const b = file("b");
    const cache: UploadCache = new Map();
    let n = 0;
    post.mockImplementation(async () => ({ ok: true, status: 201, body: { file_id: `id-${(n += 1)}`, upload_url: `https://u/${n}` } }));
    // first try: a goes up, b fails to upload
    put.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const first = await uploadAll([a, b], "/api/x", { assignment_id: "A" }, cache);
    expect(first).toEqual({ ok: false, error: "uploadFailed" });
    expect(cache.get(a)).toEqual({ id: "id-1", mime: "image/png", bytes: 1 });
    expect(cache.has(b)).toBe(false);
    // second try: a is skipped (no new link, no PUT), only b is sent
    put.mockResolvedValueOnce(true);
    const second = await uploadAll([a, b], "/api/x", { assignment_id: "A" }, cache);
    expect(second).toEqual({ ok: true, files: [{ id: "id-1", mime: "image/png", bytes: 1 }, { id: "id-3", mime: "image/png", bytes: 1 }] });
    expect(post).toHaveBeenCalledTimes(3);
    expect(put).toHaveBeenCalledTimes(3);
    // third try (the registration call failed, nothing to upload): no network at all for files
    const third = await uploadAll([a, b], "/api/x", { assignment_id: "A" }, cache);
    expect(third.ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("stops at the first refusal with the server's own code", async () => {
    post.mockResolvedValueOnce({ ok: false, status: 429, error: "upload_limit" });
    const r = await uploadAll([file("a")], "/api/x", {}, new Map());
    expect(r).toEqual({ ok: false, error: "upload_limit" });
    expect(put).not.toHaveBeenCalled();
  });
});

describe("one client id per try", () => {
  it("the same work keeps the id (so a retry is recognised as the same send); any change makes a new id", () => {
    let k = 0;
    const id = () => `id-${(k += 1)}`;
    const a = nextAttempt(null, "same", id);
    expect(nextAttempt(a, "same", id)).toBe(a);
    const b = nextAttempt(a, "changed", id);
    expect(b.id).not.toBe(a.id);
    expect(nextAttempt(b, "changed", id)).toBe(b);
  });
});

describe("error sentences come from the copy file", () => {
  it("known codes and the generic fallback, for the child and for the grown-ups", () => {
    expect(practiceErrorText("file_type", "student")).toBe(practiceStudent.errors.file_type);
    expect(practiceErrorText("upload_limit", "student")).toBe(practiceStudent.errors.upload_limit);
    expect(practiceErrorText("upload_limit", "staff")).toBe(assignPage.errors.upload_limit);
    expect(practiceErrorText("unreadable", "staff")).toBe(assignPage.errors.unreadable);
    expect(practiceErrorText("who_knows", "student")).toBe(practiceStudent.errors.generic);
    expect(practiceErrorText("who_knows", "staff")).toBe(assignPage.errors.generic);
  });
});
