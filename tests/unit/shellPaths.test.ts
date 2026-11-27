import { describe, expect, it } from "vitest";
import { appFeedback, curriculumCopy } from "@/lib/copy/vi";
import { activeFor, feedbackHref, switchHref, deskHref } from "@/lib/shell/paths";

const X = "a0000000-0000-4000-8000-000000000001";
const Y = "b0000000-0000-4000-8000-000000000002";
const S = appFeedback.screens;

describe("activeFor: every existing page keeps the feedback screen it passed to AppHeader", () => {
  const table: [string, string | null, string | null, string][] = [
    ["/", "desk", null, S.home],
    [`/learners/${X}/levels`, "progress", null, S.levels],
    [`/learners/${X}/levels/baseline`, "progress", null, S.baseline],
    [`/learners/${X}/levels/adjust`, "progress", null, S.adjust],
    [`/learners/${X}/levels/external/new`, "progress", null, S.external],
    [`/learners/${X}/weak`, "progress", null, S.weak],
    [`/learners/${X}/targets`, "progress", null, S.targets],
    [`/learners/${X}/reading/new`, "profile", "reading", S.reading],
    [`/learners/${X}/tutor-asks`, "profile", "tutorAsks", S.tutorAsks],
    [`/learners/${X}/notes/new`, "sessions", null, S.notesNew],
    [`/learners/${X}/notes`, "sessions", null, S.notes],
    [`/learners/${X}/notes/month/2026-11`, "sessions", null, S.notes],
    [`/learners/${X}/assign`, "work", null, S.assign],
    [`/learners/${X}/assigned`, "work", null, S.assigned],
    [`/learners/${X}/finish`, "work", null, S.finish],
    [`/learners/${X}/finish/a1`, "work", null, S.finish],
    ["/studio/new", "work", null, S.studioNew],
    [`/learners/${X}/help/ai`, "work", null, S.aiGuide],
    ["/studio/drafts/d1", "work", null, S.studioDraft],
    [`/learners/${X}/inquiries`, "work", null, S.inquiries],
    [`/learners/${X}/results/new`, "work", null, S.resultsNew],
    [`/learners/${X}/imports/new`, "work", null, S.importNew],
    ["/imports/b1", "work", null, S.importConfirm],
    ["/review", "work", null, S.review],
    ["/review/studio", "work", null, S.reviewStudio],
    ["/review/e1", "work", null, S.reviewEpisode],
    [`/learners/${X}/revisions`, "work", null, S.revisions],
    [`/learners/${X}/revisions/a1`, "work", null, S.revisionOne],
    [`/learners/${X}/progress`, "progress", null, S.progress],
    [`/learners/${X}/profile`, "profile", "profile", S.profile],
    [`/learners/${X}/knowledge`, "progress", null, S.knowledgeMap],
    [`/learners/${X}/curricula`, "plan", null, curriculumCopy.screenLabel],
    [`/learners/${X}/curricula/c1`, "plan", null, curriculumCopy.screenLabel],
    ["/curricula/versions/v1", "plan", null, curriculumCopy.screenLabel],
    [`/learners/${X}/roadmap`, "plan", null, S.roadmap],
    [`/learners/${X}/inbox`, "desk", null, S.inbox],
    ["/review/skills", "desk", null, S.reviewSkills],
    ["/settings/ai", "aiSettings", null, S.settingsAi],
    [`/learners/${X}/delete`, "delete", null, S.delete],
    ["/feedback", "feedback", null, S.feedback],
  ];
  for (const [path, section, child, screen] of table) {
    it(path, () => expect(activeFor(path)).toEqual({ section, child, screen }));
  }
  it("a trailing slash does not matter; an unknown page has no section and the default screen", () => {
    expect(activeFor(`/learners/${X}/weak/`).section).toBe("progress");
    expect(activeFor("/somewhere")).toEqual({ section: null, child: null, screen: appFeedback.screenDefault });
  });
});

describe("switchHref keeps the part of the app that is open", () => {
  it("same child page when every child has it; the section root otherwise", () => {
    expect(switchHref(`/learners/${X}/weak`, Y)).toBe(`/learners/${Y}/weak`);
    expect(switchHref(`/learners/${X}/targets`, Y)).toBe(`/learners/${Y}/targets`);
    expect(switchHref(`/learners/${X}/profile`, Y)).toBe(`/learners/${Y}/profile`);
    expect(switchHref(`/learners/${X}/progress`, Y)).toBe(`/learners/${Y}/progress`);
    expect(switchHref(`/learners/${X}/levels/baseline`, Y)).toBe(`/learners/${Y}/levels`);
    expect(switchHref(`/learners/${X}/curricula/c1`, Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/curricula/versions/v1", Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/review/e1", Y)).toBe(`/learners/${Y}/assigned`);
    expect(switchHref("/review", Y)).toBe(`/review?learner=${Y}`);
    expect(switchHref("/review/studio", Y)).toBe(`/review/studio?learner=${Y}`);
    expect(switchHref("/review/skills", Y)).toBe(`/review/skills?learner=${Y}`);
    expect(switchHref(`/learners/${X}/revisions/a1`, Y)).toBe(`/learners/${Y}/revisions`);
    expect(switchHref("/studio/drafts/d1", Y)).toBe(`/learners/${Y}/assigned?tab=drafts`);
    expect(switchHref(`/learners/${X}/finish/a1`, Y)).toBe(`/learners/${Y}/finish`);
    expect(switchHref(`/learners/${X}/assign`, Y)).toBe(`/learners/${Y}/assign`);
    expect(switchHref(`/learners/${X}/notes/new`, Y)).toBe(`/learners/${Y}/notes/new`);
    expect(switchHref("/studio/new", Y)).toBe(`/studio/new?learner=${Y}`);
    expect(switchHref(`/learners/${X}/help/ai`, Y)).toBe(`/learners/${Y}/help/ai`);
    expect(switchHref(`/learners/${X}/assigned`, Y)).toBe(`/learners/${Y}/assigned`);
    expect(switchHref(`/learners/${X}/inquiries`, Y)).toBe(`/learners/${Y}/inquiries`);
    expect(switchHref(`/learners/${X}/results/new`, Y)).toBe(`/learners/${Y}/results/new`);
    expect(switchHref(`/learners/${X}/inbox`, Y)).toBe(`/learners/${Y}/inbox`);
  });
  it("desk, feedback, AI settings and delete", () => {
    expect(switchHref("/", Y)).toBe(`/?learner=${Y}`);
    expect(switchHref("/feedback", Y)).toBe(`/feedback?learner=${Y}`);
    expect(switchHref("/settings/ai", Y)).toBe(`/settings/ai?learner=${Y}`);
    expect(switchHref(`/learners/${X}/delete`, Y)).toBe(`/?learner=${Y}`);
  });
  it("the knowledge map and the roadmap keep the part of the app that is open; an unknown page goes to the desk", () => {
    expect(switchHref(`/learners/${X}/knowledge`, Y)).toBe(`/learners/${Y}/knowledge`);
    expect(switchHref(`/learners/${X}/imports/new`, Y)).toBe(`/learners/${Y}/imports/new`);
    expect(switchHref(`/learners/${X}/roadmap`, Y)).toBe(`/learners/${Y}/roadmap`);
    expect(switchHref("/somewhere", Y)).toBe(`/?learner=${Y}`);
  });
});

describe("deskHref goes to the desk of THAT child (a parent would otherwise land on the other child)", () => {
  it("builds /?learner=<id>", () => {
    expect(deskHref(X)).toBe(`/?learner=${X}`);
  });
});

describe("feedbackHref carries the screen name and the child", () => {
  it("builds /feedback?screen=…&learner=…", () => {
    expect(feedbackHref(`/learners/${X}/weak`, X)).toBe(`/feedback?screen=${encodeURIComponent(S.weak)}&learner=${X}`);
    expect(feedbackHref("/", null)).toBe(`/feedback?screen=${encodeURIComponent(S.home)}`);
  });
});
