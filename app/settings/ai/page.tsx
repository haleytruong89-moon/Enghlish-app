// app/settings/ai/page.tsx
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { firstParam } from "@/lib/shell/shell";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";
import { aiSettingsCopy } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { loadAiSettings } from "@/lib/studio/load";
import { getAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Cài đặt AI (spec §3 step 0): parent only. Tutors and students: 404. */
export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
  const user = await getAuthUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found" || access.member.role !== "parent") notFound();
  const settings = await loadAiSettings(access.member.id);
  if (!settings) notFound();
  const shell = await requireShell(firstParam((await searchParams).learner));
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-2xl" data-testid="ai-settings">
        <h1 className="text-2xl font-bold">{aiSettingsCopy.title}</h1>
        <AiSettingsForm initial={settings} />
      </div>
    </StaffShell>
  );
}
