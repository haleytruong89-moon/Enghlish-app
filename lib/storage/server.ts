import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIMES, BUCKET, MAX_FILE_BYTES, SIGNED_URL_TTL_SECONDS } from "./rules";
import type { FileStorage } from "./types";

/**
 * The only place the service-role client touches Supabase Storage, and ONLY the bucket `english-work`.
 *
 * Callers (route handlers) check access on the english side FIRST; this module just turns a path they trust into a link.
 * There are no storage policies: with the service role (server only) this is the one way in. Nothing here is imported by client code
 * (`server-only`), and no key or token ever goes into a log line.
 */

type AdminClient = ReturnType<typeof createAdminClient>;
type StorageApi = AdminClient["storage"];

function isMissingBucket(err: { message?: string; statusCode?: string | number } | null): boolean {
  if (!err) return false;
  return /bucket not found/i.test(err.message ?? "") || String(err.statusCode ?? "") === "404";
}

/**
 * Create the bucket if migration 0016 could not (for example the storage service started after the migration ran). Same settings as
 * the migration; harmless when it already exists.
 */
async function ensureBucket(storage: StorageApi): Promise<void> {
  const { error } = await storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
    allowedMimeTypes: [...ALLOWED_MIMES],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`storage: could not prepare the bucket (${error.message})`);
}

export function createFileStorage(client: AdminClient = createAdminClient()): FileStorage {
  const bucket = () => client.storage.from(BUCKET);
  return {
    async createUpload(path) {
      let res = await bucket().createSignedUploadUrl(path);
      if (res.error && isMissingBucket(res.error)) {
        await ensureBucket(client.storage);
        res = await bucket().createSignedUploadUrl(path);
      }
      if (res.error || !res.data) throw new Error(`storage: could not create an upload link (${res.error?.message ?? "no data"})`);
      return { url: res.data.signedUrl };
    },

    async stat(path) {
      const { data, error } = await bucket().info(path);
      if (error || !data) return null;
      const bytes = typeof data.size === "number" ? data.size : Number.NaN;
      const mime = typeof data.contentType === "string" ? (data.contentType.split(";")[0] ?? "").trim().toLowerCase() : "";
      if (!Number.isFinite(bytes) || !mime) return null;
      return { bytes, mime };
    },

    async createDownload(path, opts) {
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_TTL_SECONDS, opts?.downloadName ? { download: opts.downloadName } : undefined);
      if (error || !data) throw new Error(`storage: could not create a download link (${error?.message ?? "no data"})`);
      return data.signedUrl;
    },

    async removeFolder(folder) {
      let removed = 0;
      // Delete in pages until the folder is empty (list returns at most `limit` names per call).
      for (let round = 0; round < 50; round += 1) {
        const { data, error } = await bucket().list(folder, { limit: 100, offset: 0 });
        if (error) throw new Error(`storage: could not list ${folder} (${error.message})`);
        const names = (data ?? []).filter((o) => o.id !== null && o.name).map((o) => `${folder}/${o.name}`);
        if (names.length === 0) break;
        const del = await bucket().remove(names);
        if (del.error) throw new Error(`storage: could not delete in ${folder} (${del.error.message})`);
        removed += names.length;
      }
      return removed;
    },
  };
}
