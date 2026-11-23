/**
 * E2a · which speech voice may read the word (L5: sound never leaves the device). Only voices the device itself provides
 * (`localService`); a network voice is never used, even if it is the only en-GB one. Pure.
 */
export type VoiceLike = { lang: string; localService: boolean; name: string };

export function pickVoice<V extends VoiceLike>(voices: readonly V[], accent: "uk" | "us"): V | null {
  const local = voices.filter((v) => v.localService && /^en[-_]/i.test(v.lang));
  const want = accent === "uk" ? /^en[-_]GB$/i : /^en[-_]US$/i;
  return local.find((v) => want.test(v.lang)) ?? local[0] ?? null;
}
