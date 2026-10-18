import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { StudentPractice } from "@/components/student/StudentPractice";
import { loadHome } from "@/lib/home/loadHome";
import { loadStudentPractice } from "@/lib/practice/load";

export const dynamic = "force-dynamic";

/** "Bài luyện" of the signed-in student. Staff and anyone who is not a student get a plain 404. */
export default async function PracticePage() {
  const data = await loadStudentPractice();
  if (data.kind === "login") redirect("/login");
  if (data.kind === "not-found") notFound();
  const home = await loadHome();
  const anyTest = home.kind === "student" && home.learners.some((l) => l.isTest);
  return (
    <>
      <AppHeader showTestBadge={anyTest} studentNav="practice" />
      <StudentPractice items={data.items} review={data.review} />
    </>
  );
}
