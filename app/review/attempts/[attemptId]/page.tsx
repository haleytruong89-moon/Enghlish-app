import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Xem cả bài làm" from a Studio card: the review page of one attempt. RLS lets only the child's tutor or parent see the episode; others 404. */
export default async function AttemptReviewRedirect({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(attemptId)) notFound();
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const db = await createUserClient();
  const { data } = await db.from("episodes").select("id").eq("attempt_id", attemptId).maybeSingle<{ id: string }>();
  if (!data) notFound();
  redirect(`/review/${data.id}`);
}
