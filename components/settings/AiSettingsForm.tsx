// components/settings/AiSettingsForm.tsx
"use client";

import { useState } from "react";
import { aiSettingsCopy } from "@/lib/copy/vi";
import { sendJson } from "@/lib/studio/client";
import type { AiSettingsView } from "@/lib/studio/types";
import { formatUsd, studioErrorText } from "@/lib/studio/view";

/** The short consent text, "Đồng ý và bật" / "Tắt AI", the month's estimated cost against the cap, and each child's ai_text consent. */
export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function toggle(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await sendJson<{ settings: AiSettingsView }>("/api/settings/ai", "PUT", { enabled });
    setBusy(false);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    setS(r.body.settings);
    setMsg(aiSettingsCopy.saved);
  }
  const spent = formatUsd(s.spentUsd);
  const cap = formatUsd(s.monthlyCapUsd);
  return (
    <section className="mt-4 flex flex-col gap-4">
      <p className="text-[15px]">{aiSettingsCopy.intro}</p>
      <ul className="list-disc pl-5 text-sm text-muted">
        {aiSettingsCopy.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p role="status" data-testid="ai-state" className="font-semibold">
        {s.enabled ? aiSettingsCopy.on : aiSettingsCopy.off}
      </p>
      <div className="flex flex-wrap gap-3">
        {s.enabled ? (
          <button type="button" disabled={busy} onClick={() => void toggle(false)} data-testid="ai-disable" className="min-h-12 rounded-xl border border-line bg-white px-5 font-semibold">
            {aiSettingsCopy.disable}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void toggle(true)} data-testid="ai-enable" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white">
            {aiSettingsCopy.enable}
          </button>
        )}
      </div>
      <p data-testid="ai-spent">{aiSettingsCopy.spent(spent, cap)}</p>
      <p className="text-sm text-muted">{aiSettingsCopy.runs(s.runsMonth)}</p>
      {s.spentUsd >= s.monthlyCapUsd ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">{aiSettingsCopy.capReached}</p>
      ) : s.softReached ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">{aiSettingsCopy.softWarning(spent, cap)}</p>
      ) : null}
      <ul className="text-sm" data-testid="ai-consents">
        {s.learners.map((l) => (
          <li key={l.id}>{aiSettingsCopy.consentLine(l.alias, l.aiText)}</li>
        ))}
      </ul>
      {msg ? <p role="status" className="text-sm text-accent">{msg}</p> : null}
    </section>
  );
}
