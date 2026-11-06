/** The few things the app needs from file storage. Handlers depend on this interface, so tests use a fake and never need Supabase. */
export interface FileStorage {
  /** A one-time upload target for exactly this path (the browser PUTs to it directly: no 4.5 MB body limit on the server). */
  createUpload(path: string): Promise<{ url: string }>;
  /** Size and type the storage service itself recorded for an object; null when nothing was uploaded there. */
  stat(path: string): Promise<{ bytes: number; mime: string } | null>;
  /** A fresh signed download link that works for SIGNED_URL_TTL_SECONDS. `downloadName` makes the browser save it under that name. */
  createDownload(path: string, opts?: { downloadName?: string }): Promise<string>;
  /** Delete every object whose path starts with `folder/`. Returns how many were removed. */
  removeFolder(folder: string): Promise<number>;
}

/** Server-side read of one stored file (Studio B1: the AI reads the tutor's test). Never handed to the browser. */
export interface FileDownloader {
  download(path: string): Promise<Uint8Array>;
}
