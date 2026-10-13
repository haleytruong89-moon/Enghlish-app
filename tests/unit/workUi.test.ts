import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceReader } from "@/components/student/SourceReader";
import { StudentHome } from "@/components/student/StudentHome";
import { activityLabels, tutorHonorific, weekdayNames, work } from "@/lib/copy/vi";
import { formatHm, nonEmptyAnswers, sourceTitle, todayLine, unsupportedLabel, wordsOf } from "@/lib/work/view";
import type { HomeView, SourceView } from "@/lib/work/types";

const home: HomeView = {
  inquiries: [
    {
      instanceId: "i1",
      titleVi: "Núi lửa",
      bigQuestionEn: "Why do volcanoes erupt?",
      bigQuestionVi: "Vì sao núi lửa phun?",
      dueOn: "2026-10-20",
      steps: [
        { activityId: "a1", stepNo: 1, activityType: "ACT-SPEAK-LIVE", mode: "PRACTICE", purpose: [], timeMin: 10, date: "2026-10-14", attempts: 0 },
        { activityId: "a2", stepNo: 2, activityType: "ACT-SOURCE-QA", mode: "PRACTICE", purpose: [], timeMin: 15, date: "2026-10-14", attempts: 1 },
        { activityId: "a3", stepNo: 3, activityType: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", purpose: ["delayed_check"], timeMin: 20, date: "2026-10-14", attempts: 0 },
        { activityId: "a4", stepNo: 4, activityType: "ACT-CANVAS-BASIC", mode: "PRACTICE", purpose: [], timeMin: 10, date: "2026-10-15", attempts: 0 },
        { activityId: "a6", stepNo: 6, activityType: "ACT-WRITE", mode: "PRACTICE", purpose: [], timeMin: 20, date: "2026-10-16", attempts: 0 },
      ],
    },
  ],
};

const render = (h: HomeView) => renderToStaticMarkup(createElement(StudentHome, { alias: "An (thử)", color: "#9A4A15", data: h }));

describe("student copy", () => {
  it("never talks about scores or right / wrong, and uses 'bạn'", () => {
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") all.push(v);
      else if (typeof v === "function") all.push(String((v as (...a: never[]) => unknown)(...([1, 2] as never[]))));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(work);
    for (const s of all) {
      expect(s, s).not.toMatch(/điểm|\d\s*\/\s*4\s*·|đúng|chính xác|thắng|streak|chuỗi ngày|xếp hạng/i);
    }
  });

  it("the live-speaking label uses the single honorific; other unsupported steps say 'on paper'", () => {
    expect(work.withTutor).toBe(`Làm cùng ${tutorHonorific} trong buổi học`);
    expect(unsupportedLabel("ACT-SPEAK-LIVE")).toBe("Làm cùng thầy/cô trong buổi học");
    for (const t of ["ACT-CANVAS-BASIC", "ACT-CANVAS-ADV", "ACT-SPEAK-MONO", "ACT-SELF-REVIEW", "ACT-REVISE"]) {
      expect(unsupportedLabel(t)).toBe("Sắp có trên app — làm theo phiếu");
    }
  });

  it("formats times in Vietnam time and the weekday line", () => {
    expect(formatHm("2026-10-14T08:05:00Z")).toBe("15:05");
    expect(formatHm("2026-10-14T20:30:00Z")).toBe("03:30"); // next day in Vietnam
    expect(formatHm("garbage")).toBe("");
    expect(todayLine(new Date("2026-10-14T08:00:00Z"))).toBe(`${weekdayNames[3]} 14/10`);
    expect(todayLine(new Date("2026-10-14T20:00:00Z"))).toBe(`${weekdayNames[4]} 15/10`);
  });
});

describe("source titles", () => {
  it("drop the staff note in the trailing bracket, keep real brackets", () => {
    expect(sourceTitle("Why Do Volcanoes Erupt? (bài đọc VOL-R)")).toBe("Why Do Volcanoes Erupt?");
    expect(sourceTitle("Dr Linh, volcano scientist (bài nghe VOL-L, file A_VOL_L)")).toBe("Dr Linh, volcano scientist");
    expect(sourceTitle("Volunteering (cloze passage, MINI-20 Q10-15)")).toBe("Volunteering");
    expect(sourceTitle("Water refill stations (listening script)")).toBe("Water refill stations");
    expect(sourceTitle("Source A — We Are Running Out of Evening")).toBe("Source A — We Are Running Out of Evening");
    expect(sourceTitle("Mars (the red planet)")).toBe("Mars (the red planet)");
    expect(sourceTitle("(bài đọc)")).toBe("(bài đọc)");
  });
});

describe("editor helpers", () => {
  it("counts words and drops empty answers", () => {
    expect(wordsOf("")).toBe(0);
    expect(wordsOf("  Volcanoes erupt\nbecause   magma rises. ")).toBe(5);
    expect(nonEmptyAnswers({ a: "x", b: "", c: "   ", d: "0" })).toEqual({ a: "x", d: "0" });
  });
});

describe("StudentHome", () => {
  it("shows the next task first (earliest not-yet-submitted step the app can do) and the checklist with states", () => {
    const html = render(home);
    expect(html).toContain('data-testid="next-task"');
    expect(html).toContain(work.nextTitle);
    expect(html).toContain('href="/activities/a3"'); // step 2 is done, step 1 cannot be done in the app
    expect(html).toContain(work.start);
    expect(html).toContain(work.progress(1, 5));
    expect(html).toMatch(/data-testid="step-2" data-state="done"/);
    expect(html).toMatch(/data-testid="step-3" data-state="now"/);
    expect(html).toMatch(/data-testid="step-6" data-state="later"/);
    expect(html).toContain(activityLabels["ACT-SOURCE-QA"]);
  });

  it("steps that are not in the app have a neutral label and no link", () => {
    const html = render(home);
    expect(html).toContain(work.withTutor);
    expect(html).toContain(work.noAppYet);
    expect(html).not.toContain('href="/activities/a1"');
    expect(html).not.toContain('href="/activities/a4"');
  });

  it("shows no score, no right/wrong, no technical code", () => {
    const html = render(home).replace(/ (class|style)="[^"]*"/g, ""); // only what a child can read or inspect
    expect(html).not.toMatch(/\d\s*\/\s*4\s*·/);
    expect(html).not.toMatch(/ACT-|PRACTICE|INDEPENDENT_CHECK|baseline|checkpoint|delayed_check/);
    expect(html).toContain("Ôn lại bài cũ"); // the delayed check, in the child's words
  });

  it("everything done → a friendly line, no streak or ranking", () => {
    const done: HomeView = { inquiries: [{ ...home.inquiries[0]!, steps: [{ ...home.inquiries[0]!.steps[1]! }] }] };
    const html = render(done);
    expect(html).toContain(work.allDone);
    expect(html).not.toContain('data-testid="next-task"');
  });

  it("nothing released yet → the empty line", () => {
    expect(render({ inquiries: [] })).toContain("Hôm nay chưa có việc mới");
  });
});

describe("SourceReader", () => {
  const sources: SourceView[] = [
    { id: "S1", title: "Volcanoes", author: "Jane", rightsNote: "Dùng trong lớp", modality: "text", url: null, text: "Para one.\n\nPara two with <b>tags</b>." },
    { id: "S2", title: "Eruption talk", author: null, rightsNote: null, modality: "audio", url: "https://example.org/talk", text: "TRANSCRIPT MUST NOT SHOW" },
    { id: "S3", title: "Clip", author: null, rightsNote: null, modality: "video", url: "javascript:alert(1)", text: null },
  ];
  const html = renderToStaticMarkup(createElement(SourceReader, { sources }));

  it("reading text is shown as plain text in paragraphs (no HTML from content)", () => {
    expect(html).toContain("Para one.");
    expect(html).toContain("&lt;b&gt;tags&lt;/b&gt;");
    expect(html).not.toContain("<b>tags</b>");
  });

  it("an audio source without a link says to ask the tutor, and shows no technical title", () => {
    const h = renderToStaticMarkup(
      createElement(SourceReader, {
        sources: [{ id: "S9", title: "Mars (bài nghe PLA-L, file A_PLA_L)", author: null, rightsNote: null, modality: "audio", url: null, text: null }],
      }),
    );
    expect(h).toContain(work.noLink);
    expect(h).toContain(">Mars<");
    expect(h).not.toContain("A_PLA_L");
  });

  it("audio and video are links that open in a new page, never a transcript, never an unsafe link", () => {
    expect(html).toContain('href="https://example.org/talk"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("TRANSCRIPT MUST NOT SHOW");
    expect(html).not.toContain("javascript:");
    expect(html).toContain(work.openAudio);
    expect(html).not.toContain(work.openVideo); // its URL was unsafe: no link at all
  });
});
