import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/purge/route", () => ({ runPurgeRoute: (...a: unknown[]) => run(...(a as [])) }));
vi.mock("@/lib/inquiries/route", () => ({ readJson: async () => ({ confirm_name: "x" }) }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/learners/[id]/purge/route";
import { isSameOrigin } from "@/lib/purge/origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("isSameOrigin", () => {
  it("accepts an Origin that names this host (Host or X-Forwarded-Host)", () => {
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://App.Example.com", host: "app.example.com" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "internal:3000", "x-forwarded-host": "app.example.com" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });
  it("refuses another site, a lookalike host, 'null' and garbage", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "https://app.example.com.evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "not a url", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "https://app.example.com" }))).toBe(false); // no host to compare with
  });
  it("without Origin only Sec-Fetch-Site: same-origin passes", () => {
    expect(isSameOrigin(h({ host: "app.example.com", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(h({ host: "app.example.com", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(h({ host: "app.example.com", "sec-fetch-site": "none" }))).toBe(false);
    expect(isSameOrigin(h({ host: "app.example.com" }))).toBe(false);
  });
});

describe("POST /api/learners/:id/purge", () => {
  beforeEach(() => run.mockClear());
  const call = (headers: Record<string, string>) =>
    POST(new NextRequest("https://app.example.com/api/learners/L1/purge", { method: "POST", headers, body: "{}" }), { params: Promise.resolve({ id: "L1" }) });

  it("answers 403 to a cross-site request and does not even start the purge route", async () => {
    const res = await call({ origin: "https://evil.example", host: "app.example.com" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("forbidden");
    expect(run).not.toHaveBeenCalled();
  });
  it("answers 403 when there is neither Origin nor Sec-Fetch-Site", async () => {
    expect((await call({ host: "app.example.com" })).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });
  it("lets a same-origin request through to the normal route (which still does requireAccess)", async () => {
    const res = await call({ origin: "https://app.example.com", host: "app.example.com" });
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
