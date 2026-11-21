// components/settings/AiSettingsForm.tsx
"use client";

import { useState } from "react";
import { aiSettingsCopy } from "@/lib/copy/vi";
import { sendJson } from "@/lib/studio/client";
import type { AiSettingsView } from "@/lib/studio/types";
import { formatUsd, studioErrorText } from "@/lib/studio/view";
import { AI_NOTICE_VERSION } from "@/lib/ai/config";

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
  const [cap, setCap] = useState(String(initial.monthlyCapUsd));
  const [soft, setSoft] = useState(String(initial.softCapUsd));
  async function saveCap(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(cap);
    const w = Number(soft);
    if (!(c >= 1 && c <= 50 && w > 0 && w <= c)) return setMsg(aiSettingsCopy.capInvalid);
    setBusy(true);
    setMsg(null);
    const r = await sendJson<{ settings: AiSettingsView }>("/api/settings/ai/cap", "PUT", { cap: c, soft: w });
    setBusy(false);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    setS(r.body.settings);
    setMsg(aiSettingsCopy.saved);
  }
  // E1: a consent recorded before the tutor existed does not cover it (the parent re-agrees to the new text).
  const reconsent = s.enabled && s.learners.some((l) => l.aiText === true && l.aiTextVersion !== null && l.aiTextVersion !== AI_NOTICE_VERSION);
  const spent = formatUsd(s.spentUsd);
  const capText = formatUsd(s.monthlyCapUsd);
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
      <p data-testid="ai-spent">{aiSettingsCopy.spent(spent, capText)}</p>
      <p className="text-sm text-muted">{aiSettingsCopy.runs(s.runsMonth)}</p>
      {s.spentUsd >= s.monthlyCapUsd ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">{aiSettingsCopy.capReached}</p>
      ) : s.softReached ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">{aiSettingsCopy.softWarning(spent, capText)}</p>
      ) : null}
      {reconsent ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="ai-reconsent">
          <p>{aiSettingsCopy.reconsent}</p>
          <button type="button" disabled={busy} onClick={() => void toggle(true)} data-testid="ai-reconsent-button" className="min-h-11 self-start rounded-xl bg-accent px-4 font-bold text-white">
            {aiSettingsCopy.enable}
          </button>
        </div>
      ) : null}
      <form onSubmit={saveCap} className="flex flex-wrap items-end gap-3" data-testid="ai-cap-form">
        <h2 className="w-full font-semibold">{aiSettingsCopy.capTitle}</h2>
        <label className="flex flex-col text-xs font-semibold">
          {aiSettingsCopy.capLabel}
          <input type="number" min={1} max={50} step={1} value={cap} onChange={(e) => setCap(e.target.value)} data-testid="ai-cap" className="min-h-11 w-28 rounded-lg border border-line px-3" />
        </label>
        <label className="flex flex-col text-xs font-semibold">
          {aiSettingsCopy.softLabel}
          <input type="number" min={0.5} max={50} step={0.5} value={soft} onChange={(e) => setSoft(e.target.value)} data-testid="ai-soft" className="min-h-11 w-28 rounded-lg border border-line px-3" />
        </label>
        <button type="submit" disabled={busy} data-testid="ai-cap-save" className="min-h-11 rounded-xl border border-line bg-white px-4 font-semibold">{aiSettingsCopy.capSave}</button>
      </form>
      {s.learners.some((l) => l.tutorToday !== null) ? (
        <ul className="text-sm" data-testid="ai-tutor-turns">
          {s.learners.map((l) => (
            <li key={l.id}>{aiSettingsCopy.tutorLine(l.alias, l.tutorToday ?? 0, l.tutorMonth ?? 0)}</li>
          ))}
        </ul>
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
