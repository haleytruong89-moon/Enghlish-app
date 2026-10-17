import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("not used: tests pass their own client"); } }));

import { createFileStorage } from "@/lib/storage/server";
import { BUCKET, MAX_FILE_BYTES } from "@/lib/storage/rules";

type Obj = { id: string | null; name: string };

/** A fake of the part of the Supabase storage client the app uses, recording every call. */
function fakeClient(opts: { missingBucketOnce?: boolean; objects?: Obj[]; info?: unknown } = {}) {
  const calls: string[] = [];
  let missing = opts.missingBucketOnce ?? false;
  let objects = [...(opts.objects ?? [])];
  const bucketApi = {
    createSignedUploadUrl: vi.fn(async (path: string) => {
      calls.push(`upload:${path}`);
      if (missing) return { data: null, error: { message: "Bucket not found", statusCode: "404" } };
      return { data: { signedUrl: `http://storage.test/upload/${path}?token=t`, token: "t", path }, error: null };
    }),
    createSignedUrl: vi.fn(async (path: string, ttl: number, o?: { download?: string }) => {
      calls.push(`sign:${path}:${ttl}:${o?.download ?? ""}`);
      return { data: { signedUrl: `http://storage.test/sign/${path}` }, error: null };
    }),
    info: vi.fn(async () => ({ data: opts.info ?? null, error: opts.info ? null : { message: "not found" } })),
    list: vi.fn(async (folder: string) => {
      calls.push(`list:${folder}`);
      return { data: objects.slice(0, 100), error: null };
    }),
    remove: vi.fn(async (names: string[]) => {
      calls.push(`remove:${names.join(",")}`);
      objects = objects.filter((o) => !names.some((n) => n.endsWith(`/${o.name}`)));
      return { data: [], error: null };
    }),
  };
  const storage = {
    from: vi.fn((b: string) => {
      calls.push(`from:${b}`);
      return bucketApi;
    }),
    createBucket: vi.fn(async (id: string, o: unknown) => {
      calls.push(`createBucket:${id}:${JSON.stringify(o)}`);
      missing = false;
      return { data: { name: id }, error: null };
    }),
  };
  return { client: { storage } as never, calls, bucketApi, storage };
}

describe("createFileStorage (service-role helper for the bucket english-work)", () => {
  it("only ever opens the english-work bucket", async () => {
    const f = fakeClient({ info: { size: 10, contentType: "image/png" } });
    const st = createFileStorage(f.client);
    await st.createUpload("a/b/c.png");
    await st.createDownload("a/b/c.png");
    await st.stat("a/b/c.png");
    await st.removeFolder("a/b");
    expect(f.storage.from.mock.calls.every((c) => c[0] === BUCKET)).toBe(true);
  });

  it("makes an upload link and creates the bucket (same settings as the migration) when it is missing", async () => {
    const f = fakeClient({ missingBucketOnce: true });
    const { url } = await createFileStorage(f.client).createUpload("fam/lea/file.png");
    expect(url).toBe("http://storage.test/upload/fam/lea/file.png?token=t");
    expect(f.storage.createBucket).toHaveBeenCalledWith(BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_BYTES,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    });
  });

  it("gives a download link valid for 300 s, optionally saved under a chosen name", async () => {
    const f = fakeClient();
    const st = createFileStorage(f.client);
    expect(await st.createDownload("p.pdf")).toBe("http://storage.test/sign/p.pdf");
    await st.createDownload("p.pdf", { downloadName: "KET.pdf" });
    expect(f.calls).toContain("sign:p.pdf:300:");
    expect(f.calls).toContain("sign:p.pdf:300:KET.pdf");
  });

  it("stat reports the size and type the storage service recorded (parameters stripped, lower case); unknown object → null", async () => {
    const ok = createFileStorage(fakeClient({ info: { size: 1234, contentType: "Image/PNG; charset=binary" } }).client);
    expect(await ok.stat("x")).toEqual({ bytes: 1234, mime: "image/png" });
    expect(await createFileStorage(fakeClient().client).stat("x")).toBeNull();
    expect(await createFileStorage(fakeClient({ info: { contentType: "image/png" } }).client).stat("x")).toBeNull();
  });

  it("removeFolder deletes only names inside that folder, page after page, and counts them", async () => {
    const objects: Obj[] = Array.from({ length: 130 }, (_, i) => ({ id: `id${i}`, name: `f${i}.png` }));
    const f = fakeClient({ objects });
    const n = await createFileStorage(f.client).removeFolder("fam/lea");
    expect(n).toBe(130);
    const removed = f.calls.filter((c) => c.startsWith("remove:")).flatMap((c) => c.slice(7).split(","));
    expect(removed).toHaveLength(130);
    expect(removed.every((p) => p.startsWith("fam/lea/"))).toBe(true);
  });
});
