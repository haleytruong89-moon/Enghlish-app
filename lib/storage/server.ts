import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIMES, BUCKET, MAX_FILE_BYTES, SIGNED_URL_TTL_SECONDS } from "./rules";
import type { FileDownloader, FileStorage } from "./types";

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
  // Read it back: a bucket that already existed under this name (made by hand, or by another app of the shared project) may be PUBLIC.
  // Never carry on with a public bucket: files of the children would be readable by anyone with the address.
  const { data, error: readError } = await storage.getBucket(BUCKET);
  if (readError || !data) throw new Error(`storage: could not read the bucket back (${readError?.message ?? "no data"})`);
  if (data.public !== false) throw new Error(`storage: the bucket ${BUCKET} is public - make it private in Supabase (Storage) before using it`);
}

function normalizeMime(raw: unknown): string {
  return typeof raw === "string" ? (raw.split(";")[0] ?? "").trim().toLowerCase() : "";
}

export function createFileStorage(client: AdminClient = createAdminClient()): FileStorage & FileDownloader {
  const bucket = () => client.storage.from(BUCKET);
  return {
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) throw new Error(`storage: could not read a stored file (${error?.message ?? "no data"})`);
      return new Uint8Array(await data.arrayBuffer());
    },

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
      // 1. The object info endpoint (exact size and type recorded by Storage).
      const info = await bucket().info(path);
      if (!info.error && info.data) {
        const bytes = typeof info.data.size === "number" ? info.data.size : Number.NaN;
        const mime = normalizeMime(info.data.contentType);
        if (Number.isFinite(bytes) && mime) return { bytes, mime };
      }
      // 2. Older Storage versions have no /object/info (it answers like "not found"): look the object up in its folder listing instead.
      //    The same numbers (metadata.size / metadata.mimetype); an object that really is missing is missing here too.
      const slash = path.lastIndexOf("/");
      const folder = slash >= 0 ? path.slice(0, slash) : "";
      const name = slash >= 0 ? path.slice(slash + 1) : path;
      const listed = await bucket().list(folder, { limit: 100, search: name });
      if (listed.error) return null;
      const hit = (listed.data ?? []).find((o) => o.name === name && o.id !== null);
      const meta = (hit?.metadata ?? null) as { size?: unknown; mimetype?: unknown } | null;
      const bytes = typeof meta?.size === "number" ? meta.size : Number.NaN;
      const mime = normalizeMime(meta?.mimetype);
      return Number.isFinite(bytes) && mime ? { bytes, mime } : null;
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
