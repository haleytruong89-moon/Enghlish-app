import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearnerCard } from "@/components/LearnerCard";
import { AdjustForm } from "@/components/levels/AdjustForm";
import { BaselineForm } from "@/components/levels/BaselineForm";
import { ExternalResultForm } from "@/components/levels/ExternalResultForm";
import { DomainDetail } from "@/components/levels/DomainDetail";
import { LevelBars } from "@/components/levels/LevelBars";
import { LevelSummaryCard } from "@/components/levels/LevelSummaryCard";
import { Milestones } from "@/components/levels/Milestones";
import { externalCopy, levelCopy, levelFormCopy } from "@/lib/copy/vi";
import type { SkillGroup } from "@/lib/skillmap/types";
import type { WeakPoint } from "@/lib/tutorwork/types";
import { assumedProfile, confirmedProfile } from "./fixtures/levels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (html: string, s: string) => html.split(s).length - 1;
const L = "b0000000-0000-4000-8000-000000000001";
const NO_DAT = /đạt/iu;
const wp = (tagKey: string, status: WeakPoint["status"]): WeakPoint => ({
  tagKey, label: tagKey, group: null, sources: status === "repeat" ? 2 : 1, bySource: { test: 1, lesson: 0, writing: 0, practice: 0 },
  itemsWrong: { test: 1, practice: 0 }, asked: 0, askedWrong: 0, lastSeen: "2026-10-01", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
});
const readingGroups: SkillGroup[] = [
  { key: "re-gist-detail", name: "Ý chính & chi tiết", descriptions: { "A1-A2": "Biển báo", B1: "Bài báo đơn giản", B2: "Bài dài, tóm tắt", "C1-C2": "Văn bản phức" }, leaves: [] },
  { key: "re-strategy", name: "Chiến lược", descriptions: { "A1-A2": "Tìm thông tin", B1: null, B2: null, "C1-C2": null }, leaves: [] },
];

describe("LevelSummaryCard", () => {
  it("asks where the child is, says it in one plain sentence, and fills Mạnh nhất / Cần tập trung / Đang chờ cô (D4)", () => {
    const html = render(createElement(LevelSummaryCard, { alias: "Nguyên", profile: confirmedProfile() }));
    expect(html).toContain(levelCopy.whereTitle("Nguyên"));
    expect(html).toMatch(/data-testid="level-strongest"[\s\S]*?Đọc · B2\+/);
    expect(html).toMatch(/data-testid="level-focus"[\s\S]*?Viết · B1\+/);
    expect(html).toMatch(/data-testid="level-waiting"[\s\S]*?Không có/);
    expect(html).not.toMatch(NO_DAT);
    expect(count(render(createElement(LevelSummaryCard, { alias: "Nguyên", profile: assumedProfile() })), levelCopy.even)).toBe(2);
  });
});

describe("LevelBars", () => {
  it("7 bars, one per domain; assumed bars are dashed and say 'Ước lượng — cô chưa xác nhận' in words (D5)", () => {
    const html = render(createElement(LevelBars, { profile: confirmedProfile(), learnerId: L, active: "reading" }));
    expect(count(html, 'data-testid="level-bar-')).toBe(7);
    expect(html).toMatch(/data-testid="level-bar-reading"[^>]*data-status="confirmed"/);
    expect(html).toMatch(/data-testid="level-bar-grammar"[^>]*data-status="assumed"/);
    expect(count(html, levelCopy.assumed)).toBe(5);
    expect(html).toContain("border-dashed");
    expect(html).toMatch(/data-testid="level-bar-reading"[\s\S]*?width:78%/); // B2+ = 7/9 of A1 → C2
    expect(html).toMatch(/data-testid="level-bar-thinking"[\s\S]*?width:50%[\s\S]*?bậc 2/); // its own 1 → 4 scale
    expect(html).toContain(levelCopy.scaleTask);
    expect(html).toContain(`href="/learners/${L}/levels?domain=writing"`);
    expect(html).not.toMatch(NO_DAT);
  });
});

describe("DomainDetail", () => {
  it("a plain sentence, what this level covers, the honest empty state before S7 (D3), the domain's weak points, and the tutor's link", () => {
    const reading = confirmedProfile().domains.find((d) => d.key === "reading")!;
    const html = render(createElement(DomainDetail, {
      alias: "Nguyên", domain: reading, groups: readingGroups, weak: [wp("doc-inference", "repeat"), wp("doc-sequence", "ok")], learnerId: L, canDecide: true,
    }));
    expect(html).toContain(levelCopy.sentenceConfirmed("Nguyên", "Đọc", "B2+"));
    expect(html).toContain(levelCopy.confirmedOn("21/10/2026", "Cô Lan"));
    expect(html).toContain("Bài dài, tóm tắt");
    expect(html).not.toContain("Tìm thông tin"); // another band
    expect(count(html, levelCopy.notYet)).toBe(3);
    expect(html).toContain("doc-inference");
    expect(html).not.toContain("doc-sequence"); // already fine
    expect(html).toContain(`href="/learners/${L}/levels/adjust?domain=reading"`);
    expect(html).toContain(`href="/learners/${L}/weak?domain=reading"`);
    expect(html).not.toMatch(NO_DAT);
  });

  it("an assumed domain says so and offers the baseline screen; the parent gets no decide link", () => {
    const grammar = confirmedProfile().domains[0]!;
    const tutor = render(createElement(DomainDetail, { alias: "Nguyên", domain: grammar, groups: [], weak: [], learnerId: L, canDecide: true }));
    expect(tutor).toContain(levelCopy.sentenceAssumed("Nguyên", "Ngữ pháp", "B2"));
    expect(tutor).toContain(levelCopy.assumed);
    expect(tutor).toContain(`href="/learners/${L}/levels/baseline"`);
    expect(tutor).toContain(levelCopy.weakNone);
    const parent = render(createElement(DomainDetail, { alias: "Nguyên", domain: grammar, groups: [], weak: [], learnerId: L, canDecide: false }));
    expect(parent).not.toContain('data-testid="level-decide-link"');
  });
});

describe("Milestones", () => {
  it("external results with domains and the sheet; reading reports by month without a source; history with kind, day, tutor, reason", () => {
    const html = render(createElement(Milestones, { profile: confirmedProfile(), learnerId: L }));
    expect(html).toContain(levelCopy.externalLine("FCE (B2 First)", "12/09/2026", "172 · Grade B"));
    expect(html).toContain('href="/learners/'+L+'/levels/external/new?edit=e1"');
    expect(html).toContain(levelCopy.editExternal);
    expect(html).toContain(levelCopy.externalDomains("Nghe, Đọc"));
    expect(html).toContain('href="/api/files/f0000000-0000-4000-8000-000000000001"');
    expect(html).toContain(levelCopy.readingReportLine("10/2026"));
    expect(html).toContain(levelCopy.historyLine("Viết", "B2", "B1+"));
    expect(html).toContain(levelCopy.historyMeta("Điều chỉnh", "22/10/2026", "Cô Lan"));
    expect(html).toContain("“Bài luận còn thiếu liên kết”");
    expect(html).toContain(`href="/learners/${L}/levels/external/new"`);
    expect(html).not.toMatch(/tomo/i);
    expect(html).not.toMatch(NO_DAT);
    const empty = render(createElement(Milestones, { profile: assumedProfile(), learnerId: L }));
    expect(empty).toContain(levelCopy.externalNone);
    expect(empty).toContain(levelCopy.historyNone);
  });

  it("the learner card links to Hồ sơ cấp", () => {
    const html = render(createElement(LearnerCard, {
      learner: { id: L, alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null }, today: null, role: "parent",
    }));
    expect(html).toContain(`href="/learners/${L}/levels"`);
    expect(html).toContain(levelCopy.link);
  });
});

describe("Milestones: corrections (A2)", () => {
  it("a corrected result shows the new entry with 'đã sửa' and what it replaced, old sheet included", () => {
    const p = confirmedProfile();
    p.externalResults = [{ ...p.externalResults[0]!, scoreText: "172 · Grade B", replaces: { id: "e0", exam: "FCE", takenOn: "2026-09-12", scoreText: "165", fileId: "f0000000-0000-4000-8000-000000000002" } }];
    const html = render(createElement(Milestones, { profile: p, learnerId: L }));
    expect(html).toMatch(/data-testid="external-corrected-e1"[\s\S]*?Đã sửa — trước đó: 165/);
    expect(html).toContain('href="/api/files/f0000000-0000-4000-8000-000000000002"');
    expect(html).not.toContain(levelCopy.corrected("172 · Grade B"));
    expect(html.match(/data-testid="external-e1"/g)).toHaveLength(1);
    expect(html).not.toContain("external-e0");
  });
});

describe("forms", () => {
  it("baseline: one row per unconfirmed domain, prefilled with the assumed level; the thinking row offers bậc 1–4", () => {
    const html = render(createElement(BaselineForm, {
      learnerId: L,
      rows: [{ key: "grammar", name: "Ngữ pháp", scale: "cefr", assumed: "B2" }, { key: "thinking", name: "Tư duy", scale: "task_level", assumed: "2" }],
    }));
    expect(html).toMatch(/data-testid="baseline-grammar"[\s\S]*?<option value="B2" selected="">B2<\/option>/);
    expect((html.match(/<option value="[ABC][12]\+?"/g) ?? []).length).toBe(9);
    expect(html).toMatch(/data-testid="baseline-thinking"[\s\S]*?<option value="2" selected="">bậc 2<\/option>/);
    expect(html).toContain(levelFormCopy.assumedHint("B2"));
    expect(html).toContain(levelFormCopy.saveBaseline);
    expect(html).not.toMatch(NO_DAT);
  });

  it("adjust: shows the current level, offers the domain's own scale and needs a reason", () => {
    const html = render(createElement(AdjustForm, { learnerId: L, domain: { key: "writing", name: "Viết", scale: "cefr", current: "B1+" } }));
    expect(html).toContain(levelFormCopy.current("B1+"));
    expect(html).toMatch(/<option value="B1\+" selected="">B1\+<\/option>/);
    expect(html).toMatch(/<textarea[^>]*required=""[^>]*data-testid="adjust-reason"/);
    expect(html).toContain(levelFormCopy.reason);
    expect(html).not.toMatch(NO_DAT);
  });

  it("external result: 8 exams, a date no later than today, 7 domain boxes, an optional PDF or image", () => {
    const html = render(createElement(ExternalResultForm, {
      learnerId: L, domains: assumedProfile().domains.map((d) => ({ key: d.key, name: d.name })), today: "2026-10-22", minDate: "2016-10-25",
    }));
    expect((html.match(/<option value="(KET|PET|FCE|CAE|CPE|VAO10_MOCK|SCHOOL|OTHER)"/g) ?? []).length).toBe(8);
    expect(html).toContain(externalCopy.examLabels.VAO10_MOCK);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*max="2026-10-22"/);
    expect(count(html, 'data-testid="external-domain-')).toBe(7);
    expect(html).toContain('accept="application/pdf,image/png,image/jpeg,image/webp"');
    expect(html).not.toMatch(NO_DAT);
  });

  it("A2: the correction form starts from the old entry, says the old one stays in history, and has no stray prefill without it", () => {
    const base = { learnerId: L, domains: assumedProfile().domains.map((d) => ({ key: d.key, name: d.name })), today: "2026-10-22", minDate: "2016-10-25" };
    const html = render(createElement(ExternalResultForm, {
      ...base, edit: { id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "165", domains: ["reading"], note: "Ghi chú cũ" },
    }));
    expect(html).toContain('data-editing="e1"');
    expect(html).toMatch(/<option value="FCE" selected="">/);
    expect(html).toContain('value="2026-09-12"');
    expect(html).toContain('value="165"');
    expect(html).toMatch(/data-testid="external-domain-reading"[^>]*checked=""|checked=""[^>]*data-testid="external-domain-reading"/);
    expect(html).toContain("Ghi chú cũ");
    expect(html).toContain(externalCopy.editFileHint);
    const plain = render(createElement(ExternalResultForm, base));
    expect(plain).not.toContain("data-editing");
    expect(plain).not.toContain(externalCopy.editFileHint);
  });
});
