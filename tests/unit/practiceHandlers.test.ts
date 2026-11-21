import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import {
  handleWriteStudioFeedback,
  handleAssignmentsList,
  handleCreateAssignment,
  handleRetractAssignment,
  handleStaffFile,
  handleStaffSubmit,
  handleStaffUploadUrl,
  handleStudentFile,
  handleStudentPractice,
  handleStudentSubmit,
  handleStudentUploadUrl,
  handleWriteSubmissionFeedback,
  type PracticeDeps,
  type PracticeStore,
} from "@/lib/practice/handlers";
import { ReviewDbError } from "@/lib/review/handlers";
import { MAX_FILE_BYTES } from "@/lib/storage/rules";
import type { FileStorage } from "@/lib/storage/types";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const A_LINK = "c0000000-0000-4000-8000-000000000001"; // An's link assignment
const A_PDF = "c0000000-0000-4000-8000-000000000002"; // An's PDF assignment
const A_NGUYEN = "c0000000-0000-4000-8000-000000000003"; // Nguyên's assignment
const FILE_NEW = "d0000000-0000-4000-8000-000000000001";
const FILE_OTHER = "d0000000-0000-4000-8000-000000000002";
const FILE_KEY = "d0000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-10-17T08:00:00Z");

const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentAn", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: null, alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};

const pathOf = (learner: string, file: string, ext: string) => `${FAMILY}/${learner}/${file}.${ext}`;
const assignmentRow = (over: Record<string, unknown>) => ({
  id: A_LINK, kind: "link", title: "Unless", url: "https://www.test-english.com/x", source_key: "test-english", tag_keys: [], due_on: null,
  frame_id: null, created_at: "2026-10-16T01:00:00Z", retracted_at: null, file: null, answer_file: null, submission: null, result_id: null, ...over,
});
const studentRow = (over: Record<string, unknown>) => ({
  assignment_id: A_LINK, kind: "link", title: "Unless", source_key: "test-english", url: "https://www.test-english.com/x", has_file: false, due_on: null,
  assigned_on: "2026-10-16", reviewed: false, submission: null, ...over,
});

const ATT_AN = "a7000000-0000-4000-8000-000000000001";

function makeStore(over: Partial<PracticeStore> = {}) {
  return {
    getOwnProfile: vi.fn(async (u: string) => (u === "u-studentAn" ? { role: "student" as const, learnerId: AN } : u === "u-parent" ? { role: "parent" as const, learnerId: null } : { role: "tutor" as const, learnerId: null })),
    getAssignmentLearnerId: vi.fn(async (id: string) => (id === A_NGUYEN ? NGUYEN : id === A_LINK || id === A_PDF ? AN : null)),
    getFile: vi.fn(async (id: string) =>
      id === FILE_NEW ? { learnerId: AN, path: pathOf(AN, FILE_NEW, "png"), mime: "image/png", kind: "result_image" } :
      id === FILE_KEY ? { learnerId: AN, path: pathOf(AN, FILE_KEY, "pdf"), mime: "application/pdf", kind: "answer_key" } : null),
    overview: vi.fn(async (_l: string, a: string | null) =>
      [assignmentRow({}), assignmentRow({ id: A_PDF, kind: "pdf", url: null, source_key: null, title: "Đề 3", file: { id: FILE_OTHER, mime: "application/pdf", bytes: 100 } })].filter((r) => !a || r.id === a)),
    issueUploadTicket: vi.fn(async () => ({ issued: 1 })),
    createAssignment: vi.fn(async () => ({ id: A_LINK, replayed: false })),
    retractAssignment: vi.fn(async () => ({ replayed: false })),
    submit: vi.fn(async () => ({ id: "s1", replayed: false })),
    writeSubmissionFeedback: vi.fn(async () => ({ id: "f1", replayed: false })),
    getStudioAttemptLearnerId: vi.fn(async (id: string) => (id === ATT_AN ? AN : null)),
    writeStudioFeedback: vi.fn(async () => ({ id: "sf1", replayed: false })),
    myPractice: vi.fn(async (_assignmentId?: string) => [studentRow({}), studentRow({ assignment_id: A_PDF, kind: "pdf", url: null, has_file: true, source_key: null, title: "Đề 3" })]),
    myPracticeFile: vi.fn(async (a: string) => (a === A_PDF ? { file_id: FILE_OTHER, path: pathOf(AN, FILE_OTHER, "pdf"), mime: "application/pdf", title: "Đề 3" } : null)),
    myReviewPoints: vi.fn(async () => ({ session_date: "2026-10-15", message: "Cố lên", labels: ["Câu điều kiện"] })),
    ...over,
  } satisfies PracticeStore;
}

function makeStorage(over: Partial<FileStorage> = {}) {
  return {
    createUpload: vi.fn(async (p: string) => ({ url: `https://signed.example/upload?p=${encodeURIComponent(p)}` })),
    stat: vi.fn(async (p: string): Promise<{ bytes: number; mime: string } | null> =>
      p === pathOf(AN, FILE_NEW, "png") ? { bytes: 1000, mime: "image/png" } : p === pathOf(AN, FILE_OTHER, "pdf") ? { bytes: 100, mime: "application/pdf" } : null),
    createDownload: vi.fn(async (p: string) => `https://signed.example/download?p=${encodeURIComponent(p)}`),
    removeFolder: vi.fn(async () => 0),
    ...over,
  } satisfies FileStorage;
}

const deps = (user: string | null, store: PracticeStore, storage: FileStorage): PracticeDeps => ({
  user: user ? { id: `u-${user}` } : null,
  store,
  storage,
  access: { store: access, allowRealLearners: false, now: NOW },
  newId: () => FILE_NEW,
});

const png = { id: FILE_NEW, mime: "image/png", bytes: 1000 };
const goodSubmit = { client_id: "client-0001", attempt: "first", used_hint: false, files: [png] };

describe("staff upload target", () => {
  it("401 without a session; 404 for a tutor of another child; 403 for the student", async () => {
    const body = { purpose: "assignment_pdf", mime: "application/pdf", bytes: 100 };
    expect((await handleStaffUploadUrl(deps(null, makeStore(), makeStorage()), AN, body)).status).toBe(401);
    expect((await handleStaffUploadUrl(deps("tutorNguyen", makeStore(), makeStorage()), AN, body)).status).toBe(404);
    expect((await handleStaffUploadUrl(deps("studentAn", makeStore(), makeStorage()), AN, body)).status).toBe(403);
  });

  it("builds the path from ids on the server and never asks storage for any other path", async () => {
    const st = makeStorage();
    const r = await handleStaffUploadUrl(deps("tutorAn", makeStore(), st), AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: 5000 });
    expect(r.status).toBe(201);
    expect(st.createUpload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "pdf"));
    expect(r.body).toMatchObject({ file_id: FILE_NEW, mime: "application/pdf" });
  });

  it("refuses a body that tries to choose the path, a wrong type, an empty or oversized file", async () => {
    const st = makeStorage();
    const d = deps("tutorAn", makeStore(), st);
    expect((await handleStaffUploadUrl(d, AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: 5, path: "x/y.pdf" })).status).toBe(400);
    expect((await handleStaffUploadUrl(d, AN, { purpose: "assignment_pdf", mime: "image/png", bytes: 5 })).body).toMatchObject({ error: "file_type" });
    expect((await handleStaffUploadUrl(d, AN, { purpose: "assignment_pdf", mime: "text/html", bytes: 5 })).status).toBe(400);
    expect((await handleStaffUploadUrl(d, AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: MAX_FILE_BYTES + 1 })).body).toMatchObject({ error: "file_too_big" });
    expect((await handleStaffUploadUrl(d, AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: 0 })).status).toBe(400);
    expect(st.createUpload).not.toHaveBeenCalled();
  });

  it("a submission upload needs an assignment of this child that is not retracted", async () => {
    const d = deps("tutorAn", makeStore({ overview: vi.fn(async () => []) }), makeStorage());
    expect((await handleStaffUploadUrl(d, AN, { purpose: "submission", assignment_id: A_LINK, mime: "image/png", bytes: 10 })).status).toBe(404);
    expect((await handleStaffUploadUrl(d, AN, { purpose: "submission", mime: "image/png", bytes: 10 })).status).toBe(400);
    const gone = deps("tutorAn", makeStore({ overview: vi.fn(async () => [assignmentRow({ retracted_at: "2026-10-16T05:00:00Z" })]) }), makeStorage());
    expect((await handleStaffUploadUrl(gone, AN, { purpose: "submission", assignment_id: A_LINK, mime: "image/png", bytes: 10 })).status).toBe(404);
  });
});

describe("give an assignment", () => {
  const link = { client_id: "client-0001", kind: "link", title: "Unless", url: "https://www.test-english.com/x", tags: ["so-sanh"] };

  it("a link must be https; the source label is the database's job", async () => {
    const s = makeStore();
    const d = deps("tutorAn", s, makeStorage());
    expect((await handleCreateAssignment(d, AN, { ...link, url: "http://www.test-english.com/x" })).body).toMatchObject({ error: "invalid_link" });
    expect((await handleCreateAssignment(d, AN, { ...link, url: "javascript:alert(1)" })).body).toMatchObject({ error: "invalid_link" });
    expect(s.createAssignment).not.toHaveBeenCalled();
    const ok = await handleCreateAssignment(d, AN, link);
    expect(ok.status).toBe(201);
    expect(s.createAssignment).toHaveBeenCalledWith(expect.objectContaining({ learnerId: AN, kind: "link", files: null, byMemberId: "m-tutorAn" }));
  });

  it("units: passed to the store, default to none, a unit twice or more than 30 is a 400, and a missing 0029 is a clear 409", async () => {
    const CUR = "c0000000-0000-4000-8000-0000000000c1";
    const s = makeStore();
    const d = deps("tutorAn", s, makeStorage());
    expect((await handleCreateAssignment(d, AN, link)).status).toBe(201);
    expect(s.createAssignment).toHaveBeenLastCalledWith(expect.objectContaining({ units: [] }));
    const units = [{ curriculum_id: CUR, unit_code: "U3" }, { curriculum_id: CUR, unit_code: "U4" }];
    expect((await handleCreateAssignment(d, AN, { ...link, units })).status).toBe(201);
    expect(s.createAssignment).toHaveBeenLastCalledWith(expect.objectContaining({ units }));
    expect((await handleCreateAssignment(d, AN, { ...link, units: [units[0], units[0]] })).body).toMatchObject({ error: "invalid_body" });
    const many = Array.from({ length: 31 }, (_, i) => ({ curriculum_id: CUR, unit_code: `U${i + 1}` }));
    expect((await handleCreateAssignment(d, AN, { ...link, units: many })).status).toBe(400);
    const old = makeStore({ createAssignment: vi.fn(async () => { throw new ReviewDbError("units_unavailable", "x"); }) });
    const r = await handleCreateAssignment(deps("tutorAn", old, makeStorage()), AN, { ...link, units });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "units_unavailable" });
    const bad = makeStore({ createAssignment: vi.fn(async () => { throw new ReviewDbError("22023", "x (bad_units)"); }) });
    expect((await handleCreateAssignment(deps("tutorAn", bad, makeStorage()), AN, { ...link, units })).body).toMatchObject({ error: "bad_units" });
  });

  it("a PDF is accepted only when storage really holds that file with that type and size", async () => {
    const pdf = { id: FILE_OTHER, mime: "application/pdf", bytes: 100 };
    const body = { client_id: "client-0002", kind: "pdf", title: "Đề 3", file: pdf };
    const s = makeStore();
    expect((await handleCreateAssignment(deps("tutorAn", s, makeStorage()), AN, body)).status).toBe(201);
    expect(s.createAssignment).toHaveBeenCalledWith(expect.objectContaining({ kind: "pdf", files: { main: pdf, answer: null } }));

    const s2 = makeStore();
    expect((await handleCreateAssignment(deps("tutorAn", s2, makeStorage({ stat: vi.fn(async () => null) })), AN, body)).body).toMatchObject({ error: "file_missing" });
    expect((await handleCreateAssignment(deps("tutorAn", s2, makeStorage({ stat: vi.fn(async () => ({ bytes: 99, mime: "application/pdf" })) })), AN, body)).body).toMatchObject({ error: "file_mismatch" });
    expect((await handleCreateAssignment(deps("tutorAn", s2, makeStorage({ stat: vi.fn(async () => ({ bytes: 100, mime: "text/html" })) })), AN, body)).body).toMatchObject({ error: "file_mismatch" });
    expect(s2.createAssignment).not.toHaveBeenCalled();
  });

  it("a link with a file, or a PDF with an address, is not a valid assignment", async () => {
    const d = deps("tutorAn", makeStore(), makeStorage());
    expect((await handleCreateAssignment(d, AN, { ...link, file: { id: FILE_OTHER, mime: "application/pdf", bytes: 100 } })).status).toBe(400);
    expect((await handleCreateAssignment(d, AN, { client_id: "client-0003", kind: "pdf", title: "x", url: "https://a.b/c" })).status).toBe(400);
  });

  it("another child's tutor gets 404, the student 403, and a repeated send is a 200 replay", async () => {
    expect((await handleCreateAssignment(deps("tutorNguyen", makeStore(), makeStorage()), AN, link)).status).toBe(404);
    expect((await handleCreateAssignment(deps("studentAn", makeStore(), makeStorage()), AN, link)).status).toBe(403);
    const replay = makeStore({ createAssignment: vi.fn(async () => ({ id: A_LINK, replayed: true })) });
    expect((await handleCreateAssignment(deps("parent", replay, makeStorage()), AN, link)).status).toBe(200);
  });
});

describe("retract", () => {
  it("an assignment of another child looks like it does not exist", async () => {
    const s = makeStore();
    expect((await handleRetractAssignment(deps("tutorAn", s, makeStorage()), AN, A_NGUYEN, {})).status).toBe(404);
    expect((await handleRetractAssignment(deps("tutorAn", s, makeStorage()), AN, "not-a-uuid", {})).status).toBe(404);
    expect(s.retractAssignment).not.toHaveBeenCalled();
    expect((await handleRetractAssignment(deps("tutorAn", s, makeStorage()), AN, A_LINK, { reason: "sai bài" })).status).toBe(201);
  });
});

describe("upload links: daily limit, ids come from the session", () => {
  it("asks the database for a ticket (the child's own member id for a student) before making any link", async () => {
    const s = makeStore();
    const st = makeStorage();
    expect((await handleStudentUploadUrl(deps("studentAn", s, st), { assignment_id: A_LINK, mime: "image/png", bytes: 10 })).status).toBe(201);
    expect(s.issueUploadTicket).toHaveBeenCalledWith({ learnerId: AN, byMemberId: "m-studentAn" });
    expect((await handleStaffUploadUrl(deps("tutorAn", s, st), AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: 10 })).status).toBe(201);
    expect(s.issueUploadTicket).toHaveBeenLastCalledWith({ learnerId: AN, byMemberId: "m-tutorAn" });
  });

  it("past the daily limit the answer is 429 upload_limit and NO link is made", async () => {
    const s = makeStore({
      issueUploadTicket: vi.fn(async () => {
        throw new ReviewDbError("54000", "eng_issue_upload_ticket: too many upload links in the last 24 hours (upload_limit)");
      }),
    });
    const st = makeStorage();
    const r = await handleStaffUploadUrl(deps("tutorAn", s, st), AN, { purpose: "assignment_pdf", mime: "application/pdf", bytes: 10 });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: "upload_limit" });
    expect((await handleStudentUploadUrl(deps("studentAn", s, st), { assignment_id: A_LINK, mime: "image/png", bytes: 10 })).status).toBe(429);
    expect(st.createUpload).not.toHaveBeenCalled();
  });

  it("the student's upload and send ask for THAT assignment by id, so more than 40 assignments cannot lock an older one out", async () => {
    const s = makeStore();
    await handleStudentUploadUrl(deps("studentAn", s, makeStorage()), { assignment_id: A_PDF, mime: "image/png", bytes: 10 });
    expect(s.myPractice).toHaveBeenLastCalledWith(A_PDF);
    await handleStudentSubmit(deps("studentAn", s, makeStorage()), { assignment_id: A_LINK, ...goodSubmit });
    expect(s.myPractice).toHaveBeenLastCalledWith(A_LINK);
  });
});

describe("the hint question (0033): asked for a link AND a PDF", () => {
  it("the child must answer true / false for both kinds; null is refused", async () => {
    const d = deps("studentAn", makeStore(), makeStorage());
    const pdfFile = { id: FILE_OTHER, mime: "application/pdf", bytes: 100 };
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit, used_hint: null })).body).toMatchObject({ error: "invalid_body" });
    expect((await handleStudentSubmit(d, { assignment_id: A_PDF, ...goodSubmit, used_hint: null, files: [pdfFile] })).body).toMatchObject({ error: "invalid_body" });
    expect((await handleStudentSubmit(d, { assignment_id: A_PDF, ...goodSubmit, used_hint: true, files: [pdfFile] })).status).toBe(201);
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit, used_hint: false })).status).toBe(201);
  });

  it("an adult sending on the child's behalf may answer or leave it empty, for both kinds", async () => {
    const s = makeStore();
    const d = deps("parent", s, makeStorage());
    const pdfFile = { id: FILE_OTHER, mime: "application/pdf", bytes: 100 };
    expect((await handleStaffSubmit(d, AN, A_LINK, { ...goodSubmit, used_hint: null })).status).toBe(201);
    expect((await handleStaffSubmit(d, AN, A_LINK, { ...goodSubmit, used_hint: true })).status).toBe(201);
    expect((await handleStaffSubmit(d, AN, A_PDF, { ...goodSubmit, used_hint: false, files: [pdfFile] })).status).toBe(201);
    expect((await handleStaffSubmit(d, AN, A_PDF, { ...goodSubmit, used_hint: null, files: [pdfFile] })).status).toBe(201);
    expect(s.submit).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: A_PDF, kind: "pdf", usedHint: false }));
  });

  it("up to 12 files in one submission, 13 are refused before anything is checked in storage", async () => {
    const many = (n: number) => Array.from({ length: n }, () => png);
    const st = makeStorage();
    const d = deps("studentAn", makeStore(), st);
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit, files: many(13) })).status).toBe(400);
    expect(st.stat).not.toHaveBeenCalled();
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit, files: many(12) })).status).toBe(201);
  });

  it("pages sent before migration 0033 is applied get a clear 409, not a 500", async () => {
    const s = makeStore({ submit: vi.fn(async () => { throw new ReviewDbError("pages_unavailable", "x"); }) });
    const r = await handleStudentSubmit(deps("studentAn", s, makeStorage()), { assignment_id: A_LINK, ...goodSubmit });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "pages_unavailable" });
  });
});

describe("staff submit on behalf of the student", () => {
  it("needs a link or a file, and checks the stored file", async () => {
    const s = makeStore();
    const d = deps("parent", s, makeStorage());
    expect((await handleStaffSubmit(d, AN, A_LINK, { client_id: "client-0001", attempt: "first", used_hint: false, files: [] })).body).toMatchObject({ error: "empty_submission" });
    expect((await handleStaffSubmit(deps("parent", s, makeStorage({ stat: vi.fn(async () => null) })), AN, A_LINK, goodSubmit)).body).toMatchObject({ error: "file_missing" });
    const ok = await handleStaffSubmit(d, AN, A_LINK, goodSubmit);
    expect(ok.status).toBe(201);
    expect(s.submit).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: A_LINK, byMemberId: "m-parent", files: [png] }));
  });

  it("a PDF assignment takes photos, not a link; a screenshot assignment refuses a PDF file", async () => {
    const d = deps("tutorAn", makeStore(), makeStorage());
    expect((await handleStaffSubmit(d, AN, A_PDF, { client_id: "client-0001", attempt: "first", used_hint: false, link_url: "https://a.b/c", files: [] })).status).toBe(400);
    const pdfFile = { id: FILE_OTHER, mime: "application/pdf", bytes: 100 };
    expect((await handleStaffSubmit(d, AN, A_LINK, { ...goodSubmit, files: [pdfFile] })).body).toMatchObject({ error: "file_type" });
    expect((await handleStaffSubmit(d, AN, A_PDF, { ...goodSubmit, used_hint: null, files: [pdfFile] })).status).toBe(201);
  });

  it("an assignment of another child is 404; a retracted one is 404", async () => {
    expect((await handleStaffSubmit(deps("tutorAn", makeStore(), makeStorage()), AN, A_NGUYEN, goodSubmit)).status).toBe(404);
    const gone = deps("tutorAn", makeStore({ overview: vi.fn(async () => [assignmentRow({ retracted_at: "2026-10-16T05:00:00Z" })]) }), makeStorage());
    expect((await handleStaffSubmit(gone, AN, A_LINK, goodSubmit)).status).toBe(404);
  });
});

describe("open a stored file (staff)", () => {
  it("returns a fresh link for the tutor of that child and the parent; never for another child's tutor or a student", async () => {
    const st = makeStorage();
    const ok = await handleStaffFile(deps("tutorAn", makeStore(), st), FILE_NEW);
    expect(ok.status).toBe(200);
    expect(st.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "png"), undefined);
    expect((await handleStaffFile(deps("parent", makeStore(), makeStorage()), FILE_NEW)).status).toBe(200);
    expect((await handleStaffFile(deps("tutorNguyen", makeStore(), makeStorage()), FILE_NEW)).status).toBe(404);
    const st2 = makeStorage();
    // the student is a member of the family but the file routes are not theirs - and the answer key is in the same table
    expect((await handleStaffFile(deps("studentAn", makeStore(), st2), FILE_KEY)).status).toBe(403);
    expect((await handleStaffFile(deps(null, makeStore(), st2), FILE_NEW)).status).toBe(401);
    expect((await handleStaffFile(deps("tutorAn", makeStore(), st2), "nope")).status).toBe(404);
    expect(st2.createDownload).not.toHaveBeenCalled();
  });

  it("a PDF that someone SENT (work photo / result image) is offered as a download, never opened inside the site; images and the tutor's own sheets are not", async () => {
    const sentPdf = makeStore({ getFile: vi.fn(async () => ({ learnerId: AN, path: pathOf(AN, FILE_KEY, "pdf"), mime: "application/pdf", kind: "work_photo" })) });
    const st = makeStorage();
    await handleStaffFile(deps("tutorAn", sentPdf, st), FILE_KEY);
    expect(st.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_KEY, "pdf"), { downloadName: "bai-em-gui.pdf" });
    const st2 = makeStorage();
    await handleStaffFile(deps("tutorAn", makeStore(), st2), FILE_NEW); // a PNG screenshot
    expect(st2.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "png"), undefined);
    const own = makeStore({ getFile: vi.fn(async () => ({ learnerId: AN, path: pathOf(AN, FILE_OTHER, "pdf"), mime: "application/pdf", kind: "assignment_pdf" })) });
    const st3 = makeStorage();
    await handleStaffFile(deps("tutorAn", own, st3), FILE_OTHER);
    expect(st3.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_OTHER, "pdf"), undefined);
  });

  it("a file that is not registered, or belongs to no child, is 404", async () => {
    expect((await handleStaffFile(deps("tutorAn", makeStore(), makeStorage()), FILE_OTHER)).status).toBe(404);
    const shared = makeStore({ getFile: vi.fn(async () => ({ learnerId: null, path: "x", mime: "application/pdf", kind: "assignment_pdf" })) });
    expect((await handleStaffFile(deps("parent", shared, makeStorage()), FILE_NEW)).status).toBe(404);
  });

  it("lists the assignments for staff only", async () => {
    const r = await handleAssignmentsList(deps("tutorAn", makeStore(), makeStorage()), AN);
    expect(r.status).toBe(200);
    expect((r.body as { assignments: unknown[] }).assignments).toHaveLength(2);
    expect((await handleAssignmentsList(deps("studentAn", makeStore(), makeStorage()), AN)).status).toBe(403);
    expect((await handleAssignmentsList(deps("tutorNguyen", makeStore(), makeStorage()), AN)).status).toBe(404);
  });
});

describe("student side", () => {
  it("sees own practice, 'Việc cần ôn' and the message; staff are refused", async () => {
    const r = await handleStudentPractice(deps("studentAn", makeStore(), makeStorage()));
    expect(r.status).toBe(200);
    const body = r.body as { items: { assignmentId: string }[]; review: { labels: string[]; message: string } };
    expect(body.items.map((i) => i.assignmentId)).toEqual([A_LINK, A_PDF]);
    expect(body.review.labels).toEqual(["Câu điều kiện"]);
    expect((await handleStudentPractice(deps("tutorAn", makeStore(), makeStorage()))).status).toBe(403);
    expect((await handleStudentPractice(deps(null, makeStore(), makeStorage()))).status).toBe(401);
  });

  it("only passes on the allow-listed fields: no tags, frame, result or answer key even if the function returned them", async () => {
    const leaky = makeStore({
      myPractice: vi.fn(async () => [studentRow({ tag_keys: ["so-sanh"], frame_id: "f", result_id: "r", answer_file: { id: FILE_KEY }, correct: 3, wrong_items: [1] })]),
    });
    const r = await handleStudentPractice(deps("studentAn", leaky, makeStorage()));
    expect(JSON.stringify(r.body)).not.toMatch(/tag_keys|so-sanh|frame|result_id|answer|correct|wrong/i);
  });

  it("the upload target is only for the student's own, unreviewed assignment", async () => {
    const st = makeStorage();
    const d = deps("studentAn", makeStore(), st);
    const ok = await handleStudentUploadUrl(d, { assignment_id: A_LINK, mime: "image/png", bytes: 1000 });
    expect(ok.status).toBe(201);
    expect(st.createUpload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "png"));
    expect((await handleStudentUploadUrl(d, { assignment_id: A_NGUYEN, mime: "image/png", bytes: 1000 })).status).toBe(404);
    expect((await handleStudentUploadUrl(d, { assignment_id: A_LINK, mime: "application/pdf", bytes: 1000 })).body).toMatchObject({ error: "file_type" });
    const reviewed = deps("studentAn", makeStore({ myPractice: vi.fn(async () => [studentRow({ reviewed: true })]) }), makeStorage());
    expect((await handleStudentUploadUrl(reviewed, { assignment_id: A_LINK, mime: "image/png", bytes: 1000 })).status).toBe(409);
    expect((await handleStudentUploadUrl(deps("tutorAn", makeStore(), makeStorage()), { assignment_id: A_LINK, mime: "image/png", bytes: 1 })).status).toBe(403);
  });

  it("submits for own assignment only, with the two taps; another family member cannot submit as the student", async () => {
    const s = makeStore();
    const d = deps("studentAn", s, makeStorage());
    const ok = await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit });
    expect(ok.status).toBe(201);
    expect(s.submit).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: A_LINK, attempt: "first", usedHint: false, byMemberId: "m-studentAn" }));
    expect((await handleStudentSubmit(d, { assignment_id: A_NGUYEN, ...goodSubmit })).status).toBe(404);
    expect((await handleStudentSubmit(deps("tutorAn", s, makeStorage()), { assignment_id: A_LINK, ...goodSubmit })).status).toBe(403);
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, client_id: "client-0009", attempt: "first", used_hint: false, files: [] })).body).toMatchObject({ error: "empty_submission" });
    expect((await handleStudentSubmit(d, { assignment_id: A_LINK, ...goodSubmit, extra: 1 })).status).toBe(400);
  });

  it("a send after the tutor has looked is 409, a stored-file mismatch is 400", async () => {
    const locked = makeStore({
      submit: vi.fn(async () => {
        throw new ReviewDbError("23505", "eng_submit_practice: x (already_reviewed)");
      }),
    });
    expect((await handleStudentSubmit(deps("studentAn", locked, makeStorage()), { assignment_id: A_LINK, ...goodSubmit })).body).toMatchObject({ error: "already_reviewed" });
    const wrong = deps("studentAn", makeStore(), makeStorage({ stat: vi.fn(async () => ({ bytes: 5, mime: "image/png" })) }));
    expect((await handleStudentSubmit(wrong, { assignment_id: A_LINK, ...goodSubmit })).body).toMatchObject({ error: "file_mismatch" });
  });

  it("downloads the PDF of own assignment through the student function; never the answer key, never someone else's", async () => {
    const st = makeStorage();
    const s = makeStore();
    const ok = await handleStudentFile(deps("studentAn", s, st), A_PDF);
    expect(ok.status).toBe(200);
    expect(st.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_OTHER, "pdf"), { downloadName: "Đề 3.pdf" });
    // the only lookup is the student function, which has no answer key in its output
    expect(s.getFile).not.toHaveBeenCalled();
    expect((await handleStudentFile(deps("studentAn", s, makeStorage()), A_NGUYEN)).status).toBe(404);
    expect((await handleStudentFile(deps("studentAn", s, makeStorage()), "nope")).status).toBe(404);
    expect((await handleStudentFile(deps("tutorAn", s, makeStorage()), A_PDF)).status).toBe(403);
  });
});

describe("SM-2: exam sheets (kind external_result)", () => {
  it("staff get an upload target for a PDF or an image; a stored PDF sheet opens as a download, never inside the site", async () => {
    const st = makeStorage();
    const r = await handleStaffUploadUrl(deps("parent", makeStore(), st), AN, { purpose: "external_result", mime: "application/pdf", bytes: 5000 });
    expect(r.status).toBe(201);
    expect(st.createUpload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "pdf"));
    expect((await handleStaffUploadUrl(deps("tutorAn", makeStore(), makeStorage()), AN, { purpose: "external_result", mime: "image/png", bytes: 5000 })).status).toBe(201);
    const sheet = makeStore({ getFile: vi.fn(async () => ({ learnerId: AN, path: pathOf(AN, FILE_KEY, "pdf"), mime: "application/pdf", kind: "external_result" })) });
    const st2 = makeStorage();
    await handleStaffFile(deps("parent", sheet, st2), FILE_KEY);
    expect(st2.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_KEY, "pdf"), { downloadName: "ket-qua-thi-ngoai.pdf" });
  });
});

describe("feedback on a submission (W4c1)", () => {
  const SUB = "e0000000-0000-4000-8000-000000000001";
  const withSub = (id = SUB) => vi.fn(async (_l: string, a: string | null) =>
    [assignmentRow({ submission: { id, created_at: "2026-10-16T09:00:00Z", attempt: "first", used_hint: false, link_url: null, by_role: "student", files: [] } })].filter((r) => !a || r.id === a));
  const body = { client_id: "client-fb-01", praise: "Bạn trình bày rõ.", items: [{ text: "Xem lại câu 38." }] };
  const call = (user: string | null, store: PracticeStore, b: unknown = body, sid = SUB, aid = A_LINK, learner = AN) =>
    handleWriteSubmissionFeedback(deps(user, store, makeStorage()), learner, aid, sid, b);

  it("the child's tutor and a parent write it; the call carries the member from the session, never from the body", async () => {
    const s = makeStore({ overview: withSub() });
    const r = await call("tutorAn", s);
    expect(r.status).toBe(201);
    expect(s.writeSubmissionFeedback).toHaveBeenCalledWith({
      submissionId: SUB, praise: "Bạn trình bày rõ.", items: [{ text: "Xem lại câu 38." }], supersedesId: null, byMemberId: "m-tutorAn", clientId: "client-fb-01",
    });
    expect((await call("parent", s)).status).toBe(201);
    expect((await call("parent", s, { ...body, by_member: "x" })).status).toBe(400);
  });

  it("401 without a session, 403 for the student, 404 for the other child's tutor; nothing is written", async () => {
    const s = makeStore({ overview: withSub() });
    expect((await call(null, s)).status).toBe(401);
    expect((await call("studentAn", s)).status).toBe(403);
    expect((await call("tutorNguyen", s)).status).toBe(404);
    expect(s.writeSubmissionFeedback).not.toHaveBeenCalled();
  });

  it("the submission must be the CURRENT one: an older id says 'replaced' (409); a retracted assignment, no submission or a bad id look like 'not found'", async () => {
    const s = makeStore({ overview: withSub() });
    const stale = await call("tutorAn", s, body, "e0000000-0000-4000-8000-000000000099");
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "submission_replaced" });
    expect((await call("tutorAn", s, body, "nope")).status).toBe(404);
    expect((await call("tutorAn", makeStore())).status).toBe(404); // no submission on the assignment
    const gone = makeStore({ overview: vi.fn(async () => [assignmentRow({ retracted_at: "2026-10-16T05:00:00Z", submission: { id: SUB, created_at: "2026-10-16T09:00:00Z", attempt: "first", used_hint: false, link_url: null, by_role: "student", files: [] } })]) });
    expect((await call("tutorAn", gone)).status).toBe(404);
    expect((await call("tutorAn", s, body, SUB, A_NGUYEN)).status).toBe(404); // an assignment of another child
    expect(s.writeSubmissionFeedback).not.toHaveBeenCalled();
  });

  it("score-like words, an empty note, too many or too long items are refused with a code the form can explain", async () => {
    const s = makeStore({ overview: withSub() });
    for (const bad of [{ praise: "Được 8 điểm" }, { items: [{ text: "3/4 câu" }] }, { praise: "Đạt yêu cầu" }]) {
      expect((await call("tutorAn", s, { ...body, ...bad })).body).toMatchObject({ error: "score_words" });
    }
    expect((await call("tutorAn", s, { client_id: "client-fb-01", items: [] })).body).toMatchObject({ error: "empty_feedback" });
    expect((await call("tutorAn", s, { client_id: "client-fb-01", praise: "   ", items: [] })).body).toMatchObject({ error: "empty_feedback" });
    expect((await call("tutorAn", s, { ...body, praise: "x".repeat(401) })).body).toMatchObject({ error: "praise_too_long" });
    expect((await call("tutorAn", s, { ...body, items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] })).body).toMatchObject({ error: "items_invalid" });
    expect((await call("tutorAn", s, { ...body, items: [{ text: "x".repeat(301) }] })).body).toMatchObject({ error: "item_too_long" });
    expect(s.writeSubmissionFeedback).not.toHaveBeenCalled();
    // a praise alone, or items alone, is enough
    expect((await call("tutorAn", s, { client_id: "client-fb-02", praise: "Chỉ khen." })).status).toBe(201);
    expect((await call("tutorAn", s, { client_id: "client-fb-03", items: [{ text: "Chỉ sửa." }] })).status).toBe(201);
  });

  it("an edit names the version it replaces; the database's answers become clear codes (replay 200, already_given / already_superseded / author_only / replaced)", async () => {
    const s = makeStore({ overview: withSub() });
    await call("tutorAn", s, { ...body, supersedes_id: "f0000000-0000-4000-8000-000000000001" });
    expect(s.writeSubmissionFeedback).toHaveBeenCalledWith(expect.objectContaining({ supersedesId: "f0000000-0000-4000-8000-000000000001" }));
    const replay = makeStore({ overview: withSub(), writeSubmissionFeedback: vi.fn(async () => ({ id: "f1", replayed: true })) });
    expect((await call("tutorAn", replay)).status).toBe(200);
    const err = (code: string, tag: string) => makeStore({ overview: withSub(), writeSubmissionFeedback: vi.fn(async () => { throw new ReviewDbError(code, `eng_write_submission_feedback: x (${tag})`); }) });
    expect((await call("tutorAn", err("23505", "already_given"))).body).toMatchObject({ error: "already_given" });
    expect((await call("tutorAn", err("23505", "already_superseded"))).body).toMatchObject({ error: "already_superseded" });
    expect((await call("tutorAn", err("23505", "submission_replaced"))).body).toMatchObject({ error: "submission_replaced" });
    expect((await call("tutorAn", err("42501", "author_only"))).status).toBe(403);
    expect((await call("tutorAn", err("23514", "score_words"))).body).toMatchObject({ error: "score_words" });
    expect((await call("tutorAn", err("PGRST202", "x"))).body).toMatchObject({ error: "feedback_unavailable" });
  });
});

describe("feedback on a Studio attempt (0037)", () => {
  const body = { client_id: "client-sfb-01", praise: "Bạn chia dạng từ chắc.", items: [{ text: "Xem lại câu 2." }] };
  const call = (user: string | null, store: PracticeStore, b: unknown = body, att = ATT_AN, learner = AN) => handleWriteStudioFeedback(deps(user, store, makeStorage()), learner, att, b);

  it("the child's tutor or a parent writes it with the member from the session", async () => {
    const s = makeStore();
    expect((await call("tutorAn", s)).status).toBe(201);
    expect(s.writeStudioFeedback).toHaveBeenCalledWith({ attemptId: ATT_AN, praise: "Bạn chia dạng từ chắc.", items: [{ text: "Xem lại câu 2." }], supersedesId: null, byMemberId: "m-tutorAn", clientId: "client-sfb-01" });
    expect((await call("parent", s)).status).toBe(201);
  });

  it("no session 401, the student 403, the other tutor 404; an attempt of another child, not of a Studio test, or a bad id: 404; nothing is written", async () => {
    const s = makeStore();
    expect((await call(null, s)).status).toBe(401);
    expect((await call("studentAn", s)).status).toBe(403);
    expect((await call("tutorNguyen", s, body, ATT_AN, NGUYEN)).status).toBe(404);
    expect((await call("tutorAn", s, body, "a7000000-0000-4000-8000-000000000099")).status).toBe(404);
    expect((await call("tutorAn", s, body, "nope")).status).toBe(404);
    expect(s.writeStudioFeedback).not.toHaveBeenCalled();
  });

  it("score words are refused before the database; database tags become the same codes as for submissions; before 0037: feedback_unavailable", async () => {
    const s = makeStore();
    expect((await call("tutorAn", s, { ...body, praise: "8 điểm" })).body).toMatchObject({ error: "score_words" });
    expect(s.writeStudioFeedback).not.toHaveBeenCalled();
    const err = (code: string, tag: string) => makeStore({ writeStudioFeedback: vi.fn(async () => { throw new ReviewDbError(code, `eng_write_studio_feedback: x (${tag})`); }) });
    expect((await call("tutorAn", err("23505", "already_given"))).body).toMatchObject({ error: "already_given" });
    expect((await call("tutorAn", err("42501", "author_only"))).status).toBe(403);
    expect((await call("tutorAn", err("23514", "not_studio"))).status).toBe(404);
    expect((await call("tutorAn", err("PGRST202", "x"))).body).toMatchObject({ error: "feedback_unavailable" });
  });
});
