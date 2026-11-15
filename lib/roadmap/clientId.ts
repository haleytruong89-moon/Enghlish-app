/**
 * One idempotency id per "intent to write". The id is kept while a retry of the SAME content is possible (network error, status 0, or a 5xx:
 * the first call may have succeeded, so a retry must carry the same id) and rotated after a success, a definite 4xx answer, or when the
 * content changes (a different payload with the same id would be refused as `client_id_reused`).
 */
export type ClientIdBook = {
  /** The id to send for this payload (new when the content differs from the last held one). */
  idFor(payload: unknown): string;
  /** Tell the book how the call ended. */
  settle(result: { ok: boolean; status: number }): void;
};

export function clientIdBook(newId: () => string = () => crypto.randomUUID()): ClientIdBook {
  let held: { key: string; id: string } | null = null;
  return {
    idFor(payload) {
      const key = JSON.stringify(payload);
      if (held === null || held.key !== key) held = { key, id: newId() };
      return held.id;
    },
    settle(result) {
      if (result.ok || (result.status >= 400 && result.status < 500)) held = null;
    },
  };
}
