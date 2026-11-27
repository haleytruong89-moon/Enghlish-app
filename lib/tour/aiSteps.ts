/**
 * 27/11 "Cách dùng AI": the tour of "Tạo bài từ đề" (the parent: the tutors are stuck with AI soạn đề, giao bài). Steps 1–5 point at the
 * upload form; "Duyệt nháp" and "Giao" happen on the draft page, so they are told in the middle of the screen (target "-" = none).
 */
import { aiGuideCopy } from "@/lib/copy/vi";
import type { TourStep } from "./steps";

export const AI_TOUR_SEEN_KEY = "eos.tour.ai.v1.seen";

export function aiTourSteps(aiAllowed: boolean): TourStep[] {
  const s = aiGuideCopy.steps;
  return [
    { key: "ai-intro", target: "studio-steps", title: s.intro.title, body: s.intro.body },
    { key: "ai-name", target: "tour-ai-name", title: s.name.title, body: s.name.body },
    { key: "ai-test", target: "tour-ai-test", title: s.test.title, body: s.test.body },
    { key: "ai-key", target: "tour-ai-key", title: s.key.title, body: s.key.body },
    { key: "ai-start", target: aiAllowed ? "studio-start-ai" : "studio-manual", title: s.start.title, body: s.start.body },
    { key: "ai-review", target: "-", title: s.review.title, body: s.review.body },
    { key: "ai-give", target: "-", title: s.give.title, body: s.give.body },
    { key: "ai-help", target: "ai-guide-link", title: s.help.title, body: s.help.body },
  ];
}
