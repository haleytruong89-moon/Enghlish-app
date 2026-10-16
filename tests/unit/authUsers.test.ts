import { describe, expect, it } from "vitest";
import { fetchAllAuthUsers, type ListUsers } from "../../scripts/lib/authUsers";

const user = (n: number, app?: string) => ({ id: `id-${n}`, email: `User${n}@Example.com`, user_metadata: app ? { app } : {} });

describe("fetchAllAuthUsers", () => {
  it("reads every page, lower-cases emails and picks up user_metadata.app", async () => {
    const pages = [[user(1), user(2, "learning-os")], [user(3)]];
    const list: ListUsers = async ({ page }) => ({ data: { users: pages[page - 1] ?? [] }, error: null });
    const map = await fetchAllAuthUsers(list, { perPage: 2, maxPages: 5 });
    expect([...map.keys()]).toEqual(["user1@example.com", "user2@example.com", "user3@example.com"]);
    expect(map.get("user2@example.com")).toEqual({ id: "id-2", email: "user2@example.com", app: "learning-os" });
    expect(map.get("user1@example.com")?.app).toBeNull();
  });

  it("fails loudly when the page cap is reached while pages are still full", async () => {
    const list: ListUsers = async ({ page }) => ({ data: { users: [user(page * 2), user(page * 2 + 1)] }, error: null });
    await expect(fetchAllAuthUsers(list, { perPage: 2, maxPages: 3 })).rejects.toThrow(/không đọc hết/);
  });

  it("does not fail when the last allowed page is not full", async () => {
    const list: ListUsers = async ({ page }) => ({ data: { users: page < 3 ? [user(page * 2), user(page * 2 + 1)] : [user(99)] }, error: null });
    const map = await fetchAllAuthUsers(list, { perPage: 2, maxPages: 3 });
    expect(map.size).toBe(5);
  });

  it("surfaces an API error", async () => {
    const list: ListUsers = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllAuthUsers(list)).rejects.toThrow(/listUsers failed: boom/);
  });
});
