// app/settings/ai/page.tsx
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";
import { aiSettingsCopy, appFeedback } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { loadAiSettings } from "@/lib/studio/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Cài đặt AI (spec §3 step 0): parent only. Tutors and students: 404. */
export default async function AiSettingsPage() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found" || access.member.role !== "parent") notFound();
  const settings = await loadAiSettings(access.member.id);
  if (!settings) notFound();
  return (
    <>
      <AppHeader name={access.member.displayName} feedbackScreen={appFeedback.screens.settingsAi} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="ai-settings">
        <h1 className="text-2xl font-bold">{aiSettingsCopy.title}</h1>
        <AiSettingsForm initial={settings} />
      </main>
    </>
  );
}
