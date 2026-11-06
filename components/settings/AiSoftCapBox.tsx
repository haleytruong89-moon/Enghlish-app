// components/settings/AiSoftCapBox.tsx
import Link from "next/link";
import { aiSettingsCopy } from "@/lib/copy/vi";
import type { AiSettingsView } from "@/lib/studio/types";
import { formatUsd } from "@/lib/studio/view";

/** Parent home: shown only when the month's AI spend reached the soft cap (spec §5.5). */
export function AiSoftCapBox({ settings }: { settings: AiSettingsView }) {
  if (!settings.softReached) return null;
  const spent = formatUsd(settings.spentUsd);
  const cap = formatUsd(settings.monthlyCapUsd);
  return (
    <section data-testid="ai-soft-cap" className="mt-5 rounded-xl border border-[#E9C46A] bg-[#FBF1DC] px-5 py-4 text-[#6B4600]">
      <h2 className="font-semibold">{aiSettingsCopy.homeBoxTitle}</h2>
      <p className="text-sm">{settings.spentUsd >= settings.monthlyCapUsd ? aiSettingsCopy.capReached : aiSettingsCopy.softWarning(spent, cap)}</p>
      <Link href="/settings/ai" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline">
        {aiSettingsCopy.homeBoxLink}
      </Link>
    </section>
  );
}
