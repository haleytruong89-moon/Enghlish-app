import Link from "next/link";
import { practiceStudent } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { todayVn } from "@/lib/inquiries/dates";
import type { StudentPracticeItem } from "@/lib/practice/types";
import { formatHm } from "@/lib/work/view";

/**
 * The lower half of a student's card. Sending is on its own screen (/submit/[id], W4c1: pages, two questions, "Nộp"); here the child only sees the way
 * there, or "Đã gửi lúc …" with "Sửa lại" (the same screen) once something was sent and nobody has looked yet.
 */
export function PracticeSubmitArea({ item }: { item: StudentPracticeItem }) {
  if (item.reviewed) {
    return (
      <p className="rounded-xl bg-[#e3ece8] px-4 py-3 text-[#1d4136]" data-testid={`reviewed-${item.assignmentId}`}>
        {practiceStudent.reviewed}
      </p>
    );
  }
  const href = `/submit/${item.assignmentId}`;
  const button = "inline-flex min-h-12 items-center rounded-xl px-5 font-semibold no-underline";
  const sub = item.submission;
  if (!sub) {
    return (
      <Link href={href} data-testid={`open-submit-${item.assignmentId}`} className={`${button} self-start bg-accent text-white`}>
        {item.kind === "pdf" ? practiceStudent.goSubmitPdf : practiceStudent.goSubmit}
      </Link>
    );
  }
  const day = todayVn(new Date(sub.submittedAt));
  const sameDay = day === todayVn();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#e3ece8] px-4 py-3 text-[#1d4136]" data-testid={`sent-${item.assignmentId}`}>
      <span>
        <b className="font-semibold"><time dateTime={sub.submittedAt}>{sameDay ? practiceStudent.sentAt(formatHm(sub.submittedAt)) : practiceStudent.sentLater(formatDateVi(day), formatHm(sub.submittedAt))}</time></b>{" "}
        {practiceStudent.sentWait}
      </span>
      <Link href={href} data-testid={`resend-${item.assignmentId}`} className="inline-flex min-h-11 items-center rounded-lg border border-accent bg-white px-3 text-sm text-[#1d4136] no-underline">
        {practiceStudent.resend}
      </Link>
    </div>
  );
}
