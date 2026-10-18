/** Compare the name the parent typed with the child's name: ignores case, extra spaces and the way accents are stored. */
export function normalizeName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export function nameMatches(typed: string, alias: string): boolean {
  const a = normalizeName(alias);
  return a.length > 0 && normalizeName(typed) === a;
}
