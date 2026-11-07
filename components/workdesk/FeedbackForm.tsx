"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appFeedback } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import { FEEDBACK_KINDS, FEEDBACK_SCREEN_MAX, FEEDBACK_TEXT_MAX, type FeedbackKind } from "@/lib/workdesk/types";

/** "Góp ý về app": pick a kind, say where, say what. Goes to the parent (who built the app). */
export function FeedbackForm({ defaultScreen }: { defaultScreen: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<FeedbackKind>("hard_to_use");
  const [screen, setScreen] = useState(defaultScreen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !screen.trim()) return setMsg({ ok: false, text: appFeedback.required });
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/feedback", { kind, screen: screen.trim(), text: text.trim(), client_id: crypto.randomUUID() });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: failText(r) });
    setText("");
    setMsg({ ok: true, text: appFeedback.sent });
    router.refresh();
  }

  return (
    <form onSubmit={send} className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-white p-5" data-testid="feedback-form">
      <div role="group" aria-label={appFeedback.kind} className="flex flex-wrap gap-2">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            data-testid={`fb-kind-${k}`}
            onClick={() => setKind(k)}
            className={`min-h-11 rounded-lg border px-4 text-sm ${kind === k ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white hover:border-accent"}`}>
            {appFeedback.kinds[k]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{appFeedback.screen}</span>
        <input id="fb_screen" value={screen} maxLength={FEEDBACK_SCREEN_MAX} onChange={(e) => setScreen(e.target.value)} className="min-h-11 rounded-lg border border-line bg-white px-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{appFeedback.text}</span>
        <textarea id="fb_text" rows={4} maxLength={FEEDBACK_TEXT_MAX} value={text} placeholder={appFeedback.textHint} onChange={(e) => setText(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} data-testid="fb-send" className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
          {busy ? appFeedback.sending : appFeedback.send}
        </button>
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} data-testid="fb-msg" className={`text-sm font-medium ${msg.ok ? "text-accent" : "text-[#7a2a0c]"}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
