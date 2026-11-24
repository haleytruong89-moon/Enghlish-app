/** E2a · the card as the browser gets it: content + IPA lines built by code from ipa_lexicon rows (L3) + the sense of the child's sentence. Pure. */
import type { CardContent, CardView } from "./card";
import { phraseIpa } from "./ipa";

export type IpaRow = { word: string; accent: string; ipa: string[] };

export const headwordWords = (headword: string): string[] => headword.toLowerCase().split(/\s+/).filter(Boolean);

export function buildCardView(cardId: string, content: CardContent, sense: number | null, rows: IpaRow[]): CardView {
  const words = headwordWords(content.headword);
  const map = (accent: string) => new Map(rows.filter((r) => r.accent === accent).map((r) => [r.word.toLowerCase(), r.ipa]));
  return {
    ...content,
    cardId,
    ipa: { uk: phraseIpa(words, map("uk")), us: phraseIpa(words, map("us")) },
    sense: sense !== null && sense >= 0 && sense < content.senses.length ? sense : null,
  };
}
