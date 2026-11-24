"use client";

import { useSyncExternalStore } from "react";
import { vocabCardCopy as c } from "@/lib/copy/vi";
import { pickVoice } from "@/lib/notebook/voice";

/**
 * 🔊 reads the word with a voice OF THE DEVICE (L5): speechSynthesis + a `localService` voice only. No such voice → nothing is shown
 * (the card says once that this device has no English voice). Nothing is recorded, nothing is sent.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener?.("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener?.("voiceschanged", onChange);
}
const snapshot = () => typeof window !== "undefined" && "speechSynthesis" in window && pickVoice(window.speechSynthesis.getVoices(), "uk") !== null;

/** null on the server (unknown), then whether this device has a local English voice (updates when the browser loads its voices). */
export function useHasVoice(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function SpeakButton({ text, accent }: { text: string; accent: "uk" | "us" }) {
  const has = useHasVoice();
  if (!has) return null;
  const speak = () => {
    const voice = pickVoice(window.speechSynthesis.getVoices(), accent);
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };
  return (
    <button type="button" onClick={speak} aria-label={c.listenAria(accent === "uk" ? c.uk : c.us)} data-testid={`speak-${accent}`}
      className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
      {c.listen}
    </button>
  );
}
