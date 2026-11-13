/** A tiny registry of "this form has unsaved changes" so links outside the form (the left column, the top bar) can ask before leaving. */
const forms = new Map<string, () => boolean>();

export function register(id: string, isDirty: () => boolean): void {
  forms.set(id, isDirty);
}
export function unregister(id: string): void {
  forms.delete(id);
}
export function hasUnsaved(): boolean {
  for (const f of forms.values()) if (f()) return true;
  return false;
}
