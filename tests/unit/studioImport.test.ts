import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import { handleImportDraft, handleRestoreDraft, IMPORT_MAX_TRIES, type StudioDeps, type StudioStore } from "@/lib/studio/handlers";
import { STUDIO_IMPORT_FORMAT, studioImportFileSchema } from "@/lib/studio/importFile";
import { EMPTY_DRAFT, type StudioDraft } from "@/lib/studio/schema";
import { CTX_B } from "./fixtures/studio";

const CLEAN: StudioDraft = {
  parts: [{ key: "E", name: "E · Phrasal verbs · tr.115", instructions: "Complete the sentences." }],
  passages: [],
  items: [
    { n: 1, part: "E", kind: "gap", out_of_app: false, stem: "Break these outgoings ____ into essentials.", options: [], passage_ref: null, key: "down", accepted: [],
      tag_key: "cum-dong-tu", target_id: null, reading_skill_key: null, explanation_vi: "break down = chia nhỏ", needs_review: false, review_reason: null },
    { n: 2, part: "E", kind: "mcq", out_of_app: false, stem: "She ____ her savings.", options: [{ letter: "A", text: "dipped into" }, { letter: "B", text: "dipped out" }],
      passage_ref: null, key: "A", accepted: [], tag_key: "cum-dong-tu", target_id: null, reading_skill_key: null, explanation_vi: "dip into = rút ra dùng",
      needs_review: true, review_reason: "Kiểm lại đáp án với sách." },
  ],
};
const FILE_B = { format: STUDIO_IMPORT_FORMAT, version: 1, track: "B", title: "Destination C1&C2 · Unit 14 · Phrasal verbs (E–G)", payload: CLEAN };

describe("Studio import file format", () => {
  it("accepts a well-formed file and refuses anything else", () => {
    expect(studioImportFileSchema.safeParse(FILE_B).success).toBe(true);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, format: "other" }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, version: 2 }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, track: "b" }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, title: " " }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, extra: 1 }).success).toBe(false);
    // the payload is the strict stored-draft schema: an unknown item field is refused
    const bad = { ...FILE_B, payload: { ...CLEAN, items: [{ ...CLEAN.items[0], score: 1 }] } };
    expect(studioImportFileSchema.safeParse(bad).success).toBe(false);
  });
});

// ---- handler ------------------------------------------------------------------------------------------------------------
const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const DRAFT = "d0000000-0000-4000-8000-000000000001";
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: null, alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
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
const EMPTY_ROW = {
  id: DRAFT, learner_id: NGUYEN, family_id: FAMILY, track_id: "B", title: FILE_B.title, status: "draft", error_code: null, payload: EMPTY_DRAFT,
  updated_at: "2026-11-16 03:00:00.123456+00", created_at: "2026-11-16T03:00:00Z", approved_at: null, approved_by_member: null,
  template_id: null, template_version: null, frame_id: null, supersedes_draft_id: null, superseded_by: null, stale: false,
  test_file: null, key_file: null, ai_cost_usd: 0, assigned: [],
};
const FULL_ROW = { ...EMPTY_ROW, payload: CLEAN };
const hashOf = (f: unknown) => createHash("sha256").update(JSON.stringify(studioImportFileSchema.parse(f))).digest("hex").slice(0, 32);

function store(over: Partial<StudioStore> = {}): StudioStore {
  const no = () => vi.fn(async () => { throw new Error("not used"); });
  return {
    getDraftLearnerId: vi.fn(async () => NGUYEN),
    getAttemptLearnerId: vi.fn(async () => null),
    issueUploadTicket: no(), aiGate: no(), aiReserve: no(), aiSettings: no(), setAiSettings: no(), logAiRun: no(),
    createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: false })),
    draftByClientId: vi.fn(async () => null),
    editDraft: no(),
    draft: vi.fn(async () => EMPTY_ROW),
    drafts: vi.fn(async () => []),
    saveDraft: vi.fn(async () => ({ updated_at: "2026-11-16 03:01:00.000001+00" })),
    finishExtraction: no(), failExtraction: no(), discardDraft: no(), approveDraft: no(), assign: no(), pending: no(), retryResults: no(),
    markRetrySeen: no(), decide: no(),
    ...over,
  };
}
function deps(user: string | null, s: StudioStore = store()): StudioDeps & { jobs: (() => Promise<void>)[] } {
  const jobs: (() => Promise<void>)[] = [];
  return {
    jobs,
    user: user ? { id: `u-${user}` } : null,
    store: s,
    storage: {
      createUpload: vi.fn(), stat: vi.fn(), createDownload: vi.fn(), removeFolder: vi.fn(), download: vi.fn(),
    } as unknown as StudioDeps["storage"],
    access: { store: access, allowRealLearners: false, now: new Date("2026-11-16T08:00:00Z") },
    schedule: (job) => jobs.push(job),
    loadContext: async () => CTX_B,
    getAi: () => { throw new Error("no AI on import"); },
    docxToText: async () => "",
  };
}

describe("handleImportDraft (Nhập bài soạn sẵn)", () => {
  it("access first: student 403, the other child's tutor 404, nobody 401; nothing is written", async () => {
    const s = store();
    expect((await handleImportDraft(deps("studentNguyen", s), NGUYEN, { file: FILE_B })).status).toBe(403);
    expect((await handleImportDraft(deps("tutorAn", s), NGUYEN, { file: FILE_B })).status).toBe(404);
    expect((await handleImportDraft(deps(null, s), NGUYEN, { file: FILE_B })).status).toBe(401);
    expect(s.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a bad body, a bad file and a file of the other track before writing", async () => {
    const s = store();
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, "x")).body).toMatchObject({ error: "invalid_body" });
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: { ...FILE_B, version: 2 } })).body).toMatchObject({ error: "import_bad_file" });
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: null })).body).toMatchObject({ error: "import_bad_file" });
    const wrong = await handleImportDraft(deps("tutorAn", s), AN, { file: FILE_B });
    expect(wrong).toMatchObject({ status: 400, body: { error: "import_wrong_track", file_track: "B", learner_track: "A" } });
    expect(s.createDraft).not.toHaveBeenCalled();
  });

  it("new file: a manual draft (no AI) with a content-based client id, then the payload saved on the draft's own time", async () => {
    const s = store();
    const d = deps("parent", s);
    const r = await handleImportDraft(d, NGUYEN, { file: FILE_B });
    expect(r).toMatchObject({ status: 201, body: { id: DRAFT, status: "draft", replayed: false, title: FILE_B.title, items: 2, needs_review: 1, blocking: 0 } });
    expect(s.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      learnerId: NGUYEN, title: FILE_B.title, testFile: null, keyFile: null, extract: false, byMemberId: "m-parent", clientId: `imp-${hashOf(FILE_B)}`,
    }));
    expect(s.saveDraft).toHaveBeenCalledWith({ draftId: DRAFT, title: FILE_B.title, payload: CLEAN, base: EMPTY_ROW.updated_at, byMemberId: "m-parent" });
    expect(s.aiGate).not.toHaveBeenCalled();
    expect(s.logAiRun).not.toHaveBeenCalled();
    expect(d.jobs).toHaveLength(0);
  });

  it("same file again: the same draft; a half import (empty draft) is finished, a full one is left alone", async () => {
    const half = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: true })) });
    // this request is the one that fills it: reported as a fresh import
    expect(await handleImportDraft(deps("tutorNguyen", half), NGUYEN, { file: FILE_B })).toMatchObject({ status: 201, body: { replayed: false, status: "draft" } });
    expect(half.saveDraft).toHaveBeenCalledTimes(1);

    // an empty draft that was saved since (the tutor removed every question) is never refilled
    const emptied = store({
      createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: true })),
      draft: vi.fn(async () => ({ ...EMPTY_ROW, created_at: "2026-11-15T03:00:00Z" })),
    });
    expect(await handleImportDraft(deps("tutorNguyen", emptied), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { replayed: true } });
    expect(emptied.saveDraft).not.toHaveBeenCalled();

    const full = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: true })), draft: vi.fn(async () => FULL_ROW) });
    expect(await handleImportDraft(deps("tutorNguyen", full), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { replayed: true, status: "draft" } });
    expect(full.saveDraft).not.toHaveBeenCalled();

    const approved = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "approved", replayed: true })), draft: vi.fn(async () => ({ ...FULL_ROW, status: "approved" })) });
    expect(await handleImportDraft(deps("tutorNguyen", approved), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { status: "approved", replayed: true } });
    expect(approved.saveDraft).not.toHaveBeenCalled();
  });

  it("a discarded earlier import: a fresh draft under the next numbered client id; stops after IMPORT_MAX_TRIES", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ id: DRAFT, status: "discarded", replayed: true })
      .mockResolvedValueOnce({ id: DRAFT, status: "draft", replayed: false });
    const s = store({ createDraft: create });
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: FILE_B })).status).toBe(201);
    expect(create.mock.calls.map((c) => (c[0] as { clientId: string }).clientId)).toEqual([`imp-${hashOf(FILE_B)}`, `imp-${hashOf(FILE_B)}-2`]);
    const always = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "discarded", replayed: true })) });
    expect((await handleImportDraft(deps("tutorNguyen", always), NGUYEN, { file: FILE_B })).body).toMatchObject({ error: "import_too_many" });
    expect(always.createDraft).toHaveBeenCalledTimes(IMPORT_MAX_TRIES);
  });

  it("renamed since the first import → import_renamed; blocking issues are reported, not refused", async () => {
    const clash = () => { throw new ReviewDbError("23505", "eng_create_studio_draft: client_id was already used for another draft"); };
    const renamed = store({ createDraft: vi.fn(async () => clash()), draftByClientId: vi.fn(async () => ({ id: DRAFT, status: "draft" })) });
    expect(await handleImportDraft(deps("tutorNguyen", renamed), NGUYEN, { file: FILE_B })).toMatchObject({ status: 409, body: { error: "import_renamed", id: DRAFT } });
    expect(renamed.draftByClientId).toHaveBeenCalledWith({ learnerId: NGUYEN, clientId: `imp-${hashOf(FILE_B)}` });

    // renamed and then discarded: the file can be imported again under the next id
    const create = vi.fn().mockImplementationOnce(async () => clash()).mockResolvedValueOnce({ id: DRAFT, status: "draft", replayed: false });
    const gone = store({ createDraft: create, draftByClientId: vi.fn(async () => ({ id: DRAFT, status: "discarded" })) });
    expect((await handleImportDraft(deps("tutorNguyen", gone), NGUYEN, { file: FILE_B })).status).toBe(201);
    expect((create.mock.calls[1]![0] as { clientId: string }).clientId).toBe(`imp-${hashOf(FILE_B)}-2`);

    const noKey = { ...FILE_B, payload: { ...CLEAN, items: [{ ...CLEAN.items[0]!, key: null }, CLEAN.items[1]!] } };
    const s = store();
    expect(await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: noKey })).toMatchObject({ status: 201, body: { blocking: 1 } });
    expect(s.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("two imports of the same file at once: the loser of the save race answers with the draft the other filled", async () => {
    const draft = vi.fn().mockResolvedValueOnce(EMPTY_ROW).mockResolvedValueOnce(FULL_ROW);
    const s = store({
      draft,
      saveDraft: vi.fn(async () => { throw new ReviewDbError("23505", "eng_save_studio_draft: the draft changed in the meantime (draft_changed)"); }),
    });
    expect(await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { id: DRAFT, status: "draft", replayed: true } });
  });

  it("the client id depends on the content, not on the key order of the file", async () => {
    const reordered = { payload: CLEAN, title: FILE_B.title, track: "B", version: 1, format: STUDIO_IMPORT_FORMAT };
    const a = store();
    const b = store();
    await handleImportDraft(deps("tutorNguyen", a), NGUYEN, { file: FILE_B });
    await handleImportDraft(deps("tutorNguyen", b), NGUYEN, { file: reordered });
    const id = (s: StudioStore) => ((s.createDraft as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { clientId: string }).clientId;
    expect(id(a)).toBe(id(b));
    const other = store();
    await handleImportDraft(deps("tutorNguyen", other), NGUYEN, { file: { ...FILE_B, title: "Khác" } });
    expect(id(other)).not.toBe(id(a));
  });

  it("a file without questions is imported with its blocking issue reported (fixed on Duyệt đề)", async () => {
    const s = store();
    const r = await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: { ...FILE_B, payload: EMPTY_DRAFT } });
    expect(r).toMatchObject({ status: 201, body: { items: 0, blocking: 1 } });
  });
});

describe("handleRestoreDraft (Khôi phục a discarded draft)", () => {
  const GONE = { ...FULL_ROW, id: DRAFT, status: "discarded", title: "Unit 14 · Idioms" };
  const COPY = "c0000000-0000-4000-8000-000000000001";

  it("a new manual draft with the same title and questions; restoring again opens the same copy", async () => {
    const draft = vi.fn(async (id: string) => (id === DRAFT ? GONE : { ...EMPTY_ROW, id: COPY }));
    const s = store({ draft, createDraft: vi.fn(async () => ({ id: COPY, status: "draft", replayed: false })) });
    const r = await handleRestoreDraft(deps("tutorNguyen", s), DRAFT);
    expect(r).toMatchObject({ status: 201, body: { id: COPY, replayed: false } });
    expect(s.createDraft).toHaveBeenCalledWith(expect.objectContaining({ title: "Unit 14 · Idioms", extract: false, clientId: `rs-${DRAFT}`, byMemberId: "m-tutorNguyen" }));
    expect(s.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ draftId: COPY, payload: CLEAN, title: "Unit 14 · Idioms" }));
    const again = store({ draft: vi.fn(async (id: string) => (id === DRAFT ? GONE : { ...FULL_ROW, id: COPY })), createDraft: vi.fn(async () => ({ id: COPY, status: "draft", replayed: true })) });
    expect(await handleRestoreDraft(deps("tutorNguyen", again), DRAFT)).toMatchObject({ status: 200, body: { id: COPY, replayed: true } });
    expect(again.saveDraft).not.toHaveBeenCalled();
  });

  it("only a discarded draft; only the child's tutor or parent", async () => {
    const live = store({ draft: vi.fn(async () => FULL_ROW) });
    expect((await handleRestoreDraft(deps("tutorNguyen", live), DRAFT)).body).toMatchObject({ error: "not_discarded" });
    const s = store({ draft: vi.fn(async () => GONE) });
    expect((await handleRestoreDraft(deps("tutorAn", s), DRAFT)).status).toBe(404);
    expect((await handleRestoreDraft(deps("studentNguyen", s), DRAFT)).status).toBe(403);
    expect(s.createDraft).not.toHaveBeenCalled();
  });
});

