import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import { auth } from "@/lib/copy/vi";
import {
  SEED_ACCOUNTS,
  TEST_LEARNER_AN_ID,
  TEST_LEARNER_NGUYEN_ID,
  type SeedUsers,
} from "../../scripts/lib/seed";

export type AccountKey = keyof SeedUsers;

export const LEARNER_IDS = { an: TEST_LEARNER_AN_ID, nguyen: TEST_LEARNER_NGUYEN_ID } as const;

/** Same pattern as scripts/seed-dev.ts (SEED_EMAIL_DOMAIN defaults to example.com). */
export function emailFor(key: AccountKey): string {
  const domain = process.env.SEED_EMAIL_DOMAIN || "example.com";
  return `eng-test-${SEED_ACCOUNTS[key].emailLocal}@${domain}`;
}

export function seedPassword(): string {
  const password = process.env.SEED_DEV_PASSWORD;
  if (!password) throw new Error("SEED_DEV_PASSWORD must be set for e2e tests");
  return password;
}

/** Fill the login form through the UI and submit it. Does not wait for the result. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(auth.login).fill(email);
  await page.getByLabel(auth.password).fill(password);
  await page.getByRole("button", { name: auth.submit, exact: true }).click();
}

/** Log in as one of the seeded test accounts and wait until the home page is shown. */
export async function loginAs(page: Page, key: AccountKey): Promise<void> {
  await submitLogin(page, emailFor(key), seedPassword());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: auth.signOut })).toBeVisible();
}

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  return { url, anonKey };
}

/**
 * What the child can READ as text, without the things that look like numbers but are not scores (PRD D35): the child's own counts
 * ([data-count="work"]) and dates (<time>, [data-date]); scripts, styles and templates never show. `scope` is a data-testid (default: the whole body).
 */
export async function studentVisibleText(page: Page, scope?: string): Promise<string> {
  return page.evaluate((testId) => {
    const root = testId ? document.querySelector(`[data-testid="${testId}"]`) : document.body;
    if (!root) return "";
    const c = root.cloneNode(true) as HTMLElement;
    c.querySelectorAll('script, style, template, time, [data-date], [data-count="work"]').forEach((e) => e.remove());
    return c.innerText ?? c.textContent ?? "";
  }, scope ?? null);
}

/** CRC-32 of a PNG chunk (kept here so the helper does not depend on a newer Node's zlib.crc32). */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A valid grey PNG of exactly `width` x `height` pixels. The e2e tests tell pages apart (and see whether one was turned) by the size the tutor's
 * browser reports for each picture, so every page of a test gets its own size.
 */
export function solidPng(width: number, height: number, grey = 200): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grey
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, grey)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
