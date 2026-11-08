import { describe, expect, it } from "vitest";
import { appFeedback, curriculumCopy, shellCopy } from "@/lib/copy/vi";
import { activeFor, feedbackHref, switchHref, deskHref } from "@/lib/shell/paths";

const X = "a0000000-0000-4000-8000-000000000001";
const Y = "b0000000-0000-4000-8000-000000000002";
const S = appFeedback.screens;

describe("activeFor: every existing page keeps the feedback screen it passed to AppHeader", () => {
  const table: [string, string | null, string | null, string][] = [
    ["/", "desk", null, S.home],
    [`/learners/${X}/levels`, "profile", "levels", S.levels],
    [`/learners/${X}/levels/baseline`, "profile", "levels", S.baseline],
    [`/learners/${X}/levels/adjust`, "profile", "levels", S.adjust],
    [`/learners/${X}/levels/external/new`, "profile", "levels", S.external],
    [`/learners/${X}/weak`, "profile", "weak", S.weak],
    [`/learners/${X}/targets`, "profile", "targets", S.targets],
    [`/learners/${X}/reading/new`, "profile", "reading", S.reading],
    [`/learners/${X}/notes/new`, "sessions", "notesNew", S.notesNew],
    [`/learners/${X}/notes`, "sessions", "notes", S.notes],
    [`/learners/${X}/assign`, "assign", "assign", S.assign],
    ["/studio/new", "assign", "studio", S.studioNew],
    ["/studio/drafts/d1", "assign", "studio", S.studioDraft],
    [`/learners/${X}/inquiries`, "assign", "inquiries", S.inquiries],
    [`/learners/${X}/results/new`, "assign", "results", S.resultsNew],
    [`/learners/${X}/curricula`, "curricula", null, curriculumCopy.screenLabel],
    [`/learners/${X}/curricula/c1`, "curricula", null, curriculumCopy.screenLabel],
    ["/curricula/versions/v1", "curricula", null, curriculumCopy.screenLabel],
    [`/learners/${X}/inbox`, "inbox", "all", S.inbox],
    ["/review", "inbox", "work", S.review],
    ["/review/skills", "inbox", "skills", S.reviewSkills],
    ["/review/studio", "inbox", "studio", S.reviewStudio],
    ["/review/e1", "inbox", "work", S.reviewEpisode],
    [`/learners/${X}/revisions`, "inbox", "revisions", S.revisions],
    [`/learners/${X}/revisions/a1`, "inbox", "revisions", S.revisionOne],
    ["/settings/ai", "aiSettings", null, S.settingsAi],
    [`/learners/${X}/delete`, "delete", null, S.delete],
    ["/feedback", "feedback", null, S.feedback],
    // reserved for later slices
    [`/learners/${X}/knowledge`, "knowledge", null, shellCopy.sections.knowledge],
    [`/learners/${X}/roadmap`, "roadmap", null, shellCopy.sections.roadmap],
    [`/learners/${X}/imports/new`, "assign", null, shellCopy.sections.assign],
  ];
  for (const [path, section, child, screen] of table) {
    it(path, () => expect(activeFor(path)).toEqual({ section, child, screen }));
  }
  it("a trailing slash does not matter; an unknown page has no section and the default screen", () => {
    expect(activeFor(`/learners/${X}/weak/`).section).toBe("profile");
    expect(activeFor("/somewhere")).toEqual({ section: null, child: null, screen: appFeedback.screenDefault });
  });
});

describe("switchHref keeps the part of the app that is open", () => {
  it("same child page when every child has it; the section root otherwise", () => {
    expect(switchHref(`/learners/${X}/weak`, Y)).toBe(`/learners/${Y}/weak`);
    expect(switchHref(`/learners/${X}/levels/baseline`, Y)).toBe(`/learners/${Y}/levels`);
    expect(switchHref(`/learners/${X}/curricula/c1`, Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/curricula/versions/v1", Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/review/e1", Y)).toBe(`/review?learner=${Y}`);
    expect(switchHref("/studio/drafts/d1", Y)).toBe(`/studio/new?learner=${Y}`);
    expect(switchHref(`/learners/${X}/inbox`, Y)).toBe(`/learners/${Y}/inbox`);
  });
  it("desk, feedback, AI settings and delete", () => {
    expect(switchHref("/", Y)).toBe(`/?learner=${Y}`);
    expect(switchHref("/feedback", Y)).toBe(`/feedback?learner=${Y}`);
    expect(switchHref("/settings/ai", Y)).toBe(`/settings/ai?learner=${Y}`);
    expect(switchHref(`/learners/${X}/delete`, Y)).toBe(`/learners/${Y}/delete`);
  });
  it("a 'soon' section or an unknown page goes to the desk", () => {
    expect(switchHref(`/learners/${X}/knowledge`, Y)).toBe(`/?learner=${Y}`);
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
