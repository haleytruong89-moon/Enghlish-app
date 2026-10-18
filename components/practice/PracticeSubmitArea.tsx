"use client";

import { useState } from "react";
import { practiceStudent } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { todayVn } from "@/lib/inquiries/dates";
import type { StudentPracticeItem } from "@/lib/practice/types";
import { formatHm } from "@/lib/work/view";
import { SubmitPanel } from "./SubmitPanel";

/** The lower half of a student's card: the send form, or "Đã gửi lúc …" with "Sửa lại" once something was sent. */
export function PracticeSubmitArea({ item }: { item: StudentPracticeItem }) {
  const [editing, setEditing] = useState(false);
  if (item.reviewed) {
    return (
      <p className="rounded-xl bg-[#e3ece8] px-4 py-3 text-[#1d4136]" data-testid={`reviewed-${item.assignmentId}`}>
        {practiceStudent.reviewed}
      </p>
    );
  }
  const sub = item.submission;
  if (!sub || editing) {
    return (
      <SubmitPanel
        variant="student"
        assignmentId={item.assignmentId}
        kind={item.kind}
        initial={sub ? { attempt: sub.attempt, usedHint: sub.usedHint } : undefined}
        onDone={() => setEditing(false)}
      />
    );
  }
  const day = todayVn(new Date(sub.submittedAt));
  const sameDay = day === todayVn();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#e3ece8] px-4 py-3 text-[#1d4136]" data-testid={`sent-${item.assignmentId}`}>
      <span>
        <b className="font-semibold">{sameDay ? practiceStudent.sentAt(formatHm(sub.submittedAt)) : practiceStudent.sentLater(formatDateVi(day), formatHm(sub.submittedAt))}</b>{" "}
        {practiceStudent.sentWait}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        data-testid={`resend-${item.assignmentId}`}
        className="min-h-11 rounded-lg border border-accent bg-white px-3 text-sm text-[#1d4136]"
      >
        {practiceStudent.resend}
      </button>
    </div>
  );
}
