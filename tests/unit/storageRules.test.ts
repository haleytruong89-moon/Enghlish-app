import { describe, expect, it, vi } from "vitest";
import { detectLinkSource, hostOf, parseHttpsUrl } from "@/lib/practice/link";
import {
  ALLOWED_MIMES,
  BUCKET,
  MAX_FILE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  buildPath,
  checkFile,
  extensionFor,
  isAllowedMime,
  learnerFolder,
  parsePath,
  safeDownloadName,
} from "@/lib/storage/rules";
import { deleteLearnerFolder } from "@/lib/storage/purge";
import type { FileStorage } from "@/lib/storage/types";

const FAMILY = "e0000000-0000-4000-8000-000000000001";
const LEARNER = "e0000000-0000-4000-8000-00000000b001";
const FILE = "11111111-2222-4333-8444-555555555555";

describe("bucket constants", () => {
  it("one private bucket, 15 MB, 5-minute download links, only pdf and three image types", () => {
    expect(BUCKET).toBe("english-work");
    expect(MAX_FILE_BYTES).toBe(15 * 1024 * 1024);
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
    // S B1: .docx for Studio files only (checkFile)
    expect([...ALLOWED_MIMES]).toEqual(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
  });
});

describe("file checks (mime + size)", () => {
  it("accepts the four types up to exactly 15 MB", () => {
    for (const mime of ALLOWED_MIMES.filter((m) => !m.includes("wordprocessingml"))) expect(checkFile("work_photo", mime, MAX_FILE_BYTES)).toEqual({ ok: true });
    expect(checkFile("work_photo", "image/png", 1)).toEqual({ ok: true });
  });
  it("refuses other types (html, svg, gif, word, empty, missing)", () => {
    for (const mime of ["text/html", "image/svg+xml", "image/gif", "application/msword", "", undefined, null, 5]) {
      expect(checkFile("work_photo", mime, 100), String(mime)).toEqual({ ok: false, reason: "type" });
    }
  });
  it("refuses empty, over-size and non-integer sizes", () => {
    expect(checkFile("work_photo", "image/png", 0)).toEqual({ ok: false, reason: "empty" });
    expect(checkFile("work_photo", "image/png", -5)).toEqual({ ok: false, reason: "empty" });
    expect(checkFile("work_photo", "image/png", 1.5)).toEqual({ ok: false, reason: "empty" });
    expect(checkFile("work_photo", "image/png", "100")).toEqual({ ok: false, reason: "empty" });
    expect(checkFile("work_photo", "image/png", Number.NaN)).toEqual({ ok: false, reason: "empty" });
    expect(checkFile("work_photo", "image/png", MAX_FILE_BYTES + 1)).toEqual({ ok: false, reason: "too_big" });
  });
  it("an assignment sheet must be a PDF and a result screenshot must be an image; key and paper-work photos take either", () => {
    expect(checkFile("assignment_pdf", "image/png", 10)).toEqual({ ok: false, reason: "kind" });
    expect(checkFile("assignment_pdf", "application/pdf", 10)).toEqual({ ok: true });
    expect(checkFile("result_image", "application/pdf", 10)).toEqual({ ok: false, reason: "kind" });
    expect(checkFile("result_image", "image/webp", 10)).toEqual({ ok: true });
    expect(checkFile("answer_key", "application/pdf", 10)).toEqual({ ok: true });
    expect(checkFile("answer_key", "image/jpeg", 10)).toEqual({ ok: true });
    expect(checkFile("work_photo", "application/pdf", 10)).toEqual({ ok: true });
  });
  it("isAllowedMime is a type guard that rejects non-strings", () => {
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("IMAGE/JPEG")).toBe(false);
    expect(isAllowedMime(undefined)).toBe(false);
  });
});

describe("path builder", () => {
  it("builds {family}/{learner}/{file}.{ext} from ids and the type", () => {
    expect(buildPath({ familyId: FAMILY, learnerId: LEARNER, fileId: FILE, mime: "application/pdf" })).toBe(`${FAMILY}/${LEARNER}/${FILE}.pdf`);
    expect(buildPath({ familyId: FAMILY, learnerId: LEARNER, fileId: FILE, mime: "image/jpeg" })).toBe(`${FAMILY}/${LEARNER}/${FILE}.jpg`);
    expect(buildPath({ familyId: FAMILY, learnerId: null, fileId: FILE, mime: "image/webp" })).toBe(`${FAMILY}/shared/${FILE}.webp`);
    expect(extensionFor("image/png")).toBe("png");
  });
  it("round-trips through parsePath and refuses everything that is not exactly that shape", () => {
    const p = buildPath({ familyId: FAMILY, learnerId: LEARNER, fileId: FILE, mime: "image/png" });
    expect(parsePath(p)).toEqual({ familyId: FAMILY, learnerId: LEARNER, fileId: FILE, ext: "png" });
    expect(parsePath(`${FAMILY}/shared/${FILE}.pdf`)?.learnerId).toBeNull();
    for (const bad of [
      "",
      `../${LEARNER}/${FILE}.png`,
      `${FAMILY}/${LEARNER}/${FILE}.png/extra`,
      `${FAMILY}/${LEARNER}/${FILE}.exe`,
      `${FAMILY}/${LEARNER}/${FILE}.PNG`,
      `${FAMILY}/${LEARNER}/../${FILE}.png`,
      `${FAMILY}//${FILE}.png`,
      `${FAMILY}/${LEARNER}/not-a-uuid.png`,
      `/${FAMILY}/${LEARNER}/${FILE}.png`,
    ]) {
      expect(parsePath(bad), bad).toBeNull();
    }
  });
  it("never builds a path from ids that are not lower-case uuids (no '..', no upper case, no slashes)", () => {
    for (const id of ["../x", "ABCDEFAB-2222-4333-8444-555555555555", `${FILE}/x`, ""]) {
      expect(() => buildPath({ familyId: id, learnerId: LEARNER, fileId: FILE, mime: "image/png" })).toThrow();
      expect(() => buildPath({ familyId: FAMILY, learnerId: id, fileId: FILE, mime: "image/png" })).toThrow();
      expect(() => buildPath({ familyId: FAMILY, learnerId: LEARNER, fileId: id, mime: "image/png" })).toThrow();
    }
  });
  it("the child's folder is {family}/{learner}", () => {
    expect(learnerFolder(FAMILY, LEARNER)).toBe(`${FAMILY}/${LEARNER}`);
    expect(() => learnerFolder(FAMILY, "../..")).toThrow();
  });
});

describe("download file name", () => {
  it("keeps Vietnamese letters, drops path pieces and control characters, never returns an empty name", () => {
    expect(safeDownloadName("KET Reading — Part 1–3", "application/pdf")).toBe("KET Reading — Part 1–3.pdf");
    expect(safeDownloadName('a/b\\c:d*e?"f<g>h|i', "application/pdf")).toBe("a b c d e f g h i.pdf");
    expect(safeDownloadName("../../etc/passwd", "image/png")).toBe(".. .. etc passwd.png");
    expect(safeDownloadName("  \n\t ", "application/pdf")).toBe("bai-luyen.pdf");
    expect(safeDownloadName("x".repeat(300), "application/pdf").length).toBe(84);
  });
});

describe("links (https only; source from the host)", () => {
  it("recognises the four sources", () => {
    expect(detectLinkSource("https://test-english.com/grammar/b2/unless/")).toBe("test-english");
    expect(detectLinkSource("https://www.test-english.com/x")).toBe("test-english");
    expect(detectLinkSource("https://notebooklm.google.com/notebook/1")).toBe("notebooklm");
    expect(detectLinkSource("https://notebook.google.com/notebook/1")).toBe("notebooklm");
    expect(detectLinkSource("https://gemini.google.com/share/1")).toBe("gemini");
    expect(detectLinkSource("https://share.gemini.google/1")).toBe("gemini");
    expect(detectLinkSource("https://quizlet.com/abc")).toBe("other");
  });
  it("is not fooled by look-alike hosts, user info or other schemes", () => {
    expect(detectLinkSource("https://test-english.com.evil.org/")).toBe("other");
    expect(detectLinkSource("https://nottest-english.com/")).toBe("other");
    expect(detectLinkSource("https://evil.org/test-english.com")).toBe("other");
    expect(detectLinkSource("https://test-english.com@evil.org/")).toBeNull();
    expect(detectLinkSource("https://user:pw@test-english.com/")).toBeNull();
    for (const bad of ["http://test-english.com", "javascript:alert(1)", "data:text/html,x", "ftp://x.org", "//x.org", "test-english.com", "", "   ", "https://a b.org", `https://x.org/${"a".repeat(2000)}`]) {
      expect(detectLinkSource(bad), bad).toBeNull();
    }
  });
  it("trims the address and reads the host", () => {
    expect(parseHttpsUrl("  https://example.org/a?b=1  ")).toBe("https://example.org/a?b=1");
    expect(hostOf("https://Example.ORG:8443/a")).toBe("example.org");
  });
});

describe("deleteLearnerFolder (purge helper)", () => {
  it("asks storage to empty exactly {family}/{learner}, nothing else", async () => {
    const removeFolder = vi.fn(async () => 3);
    const storage = { removeFolder } as unknown as FileStorage;
    expect(await deleteLearnerFolder(storage, FAMILY, LEARNER)).toBe(3);
    expect(removeFolder).toHaveBeenCalledOnce();
    expect(removeFolder).toHaveBeenCalledWith(`${FAMILY}/${LEARNER}`);
  });
  it("refuses an id that could widen the folder", async () => {
    const removeFolder = vi.fn(async () => 0);
    const storage = { removeFolder } as unknown as FileStorage;
    await expect(deleteLearnerFolder(storage, FAMILY, "")).rejects.toThrow();
    await expect(deleteLearnerFolder(storage, "../", LEARNER)).rejects.toThrow();
    expect(removeFolder).not.toHaveBeenCalled();
  });
});

describe("Studio files (B1): PDF or Word .docx, only for the test and its answer key", () => {
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  it("accepts .docx only for studio_test / studio_key; Studio kinds refuse images", () => {
    expect(checkFile("studio_test", DOCX, 10)).toEqual({ ok: true });
    expect(checkFile("studio_key", "application/pdf", 10)).toEqual({ ok: true });
    expect(checkFile("studio_test", "image/png", 10)).toEqual({ ok: false, reason: "kind" });
    expect(checkFile("answer_key", DOCX, 10)).toEqual({ ok: false, reason: "kind" });
    expect(checkFile("work_photo", DOCX, 10)).toEqual({ ok: false, reason: "kind" });
    expect(checkFile("studio_test", "application/msword", 10)).toEqual({ ok: false, reason: "type" });
    expect(checkFile("studio_test", DOCX, MAX_FILE_BYTES + 1)).toEqual({ ok: false, reason: "too_big" });
  });
  it("paths end in .docx and parse back", () => {
    const p = buildPath({ familyId: "e0000000-0000-4000-8000-000000000001", learnerId: "e0000000-0000-4000-8000-00000000b001", fileId: "e0000000-0000-4000-8000-0000000000f1", mime: DOCX });
    expect(p.endsWith(".docx")).toBe(true);
    expect(parsePath(p)?.ext).toBe("docx");
  });
});
