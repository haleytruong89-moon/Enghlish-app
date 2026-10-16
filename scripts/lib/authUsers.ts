/** One page of Supabase `auth.admin.listUsers` (only the fields this repo reads). */
export type AuthUserPage = {
  data: { users: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }[] } | null;
  error: { message: string } | null;
};
export type ListUsers = (params: { page: number; perPage: number }) => Promise<AuthUserPage>;

export type AuthUserInfo = { id: string; email: string; app: string | null };

export const AUTH_PAGE_SIZE = 200;
export const AUTH_MAX_PAGES = 50;

/**
 * Every auth user, keyed by lower-case email. Fails LOUDLY when the page cap is reached with a full last page:
 * a silently truncated list would make an existing account look missing and a duplicate one would be created.
 */
export async function fetchAllAuthUsers(
  listUsers: ListUsers,
  opts: { perPage?: number; maxPages?: number } = {},
): Promise<Map<string, AuthUserInfo>> {
  const perPage = opts.perPage ?? AUTH_PAGE_SIZE;
  const maxPages = opts.maxPages ?? AUTH_MAX_PAGES;
  const byEmail = new Map<string, AuthUserInfo>();
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await listUsers({ page, perPage });
    if (error || !data) throw new Error(`listUsers failed: ${error?.message ?? "no data"}`);
    for (const u of data.users) {
      if (!u.email) continue;
      const app = u.user_metadata?.app;
      byEmail.set(u.email.toLowerCase(), { id: u.id, email: u.email.toLowerCase(), app: typeof app === "string" ? app : null });
    }
    if (data.users.length < perPage) return byEmail;
  }
  throw new Error(
    `Có hơn ${maxPages * perPage} tài khoản đăng nhập — công cụ không đọc hết được danh sách nên dừng (tránh tạo trùng). Báo dev tăng giới hạn.`,
  );
}
