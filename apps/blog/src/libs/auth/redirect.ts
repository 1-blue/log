export const DEFAULT_ADMIN_PATH = "/admin" as const;
export const ADMIN_LOGIN_PATH = "/admin/login" as const;

export function getSafeAdminNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    (value !== DEFAULT_ADMIN_PATH && !value.startsWith("/admin/")) ||
    value.startsWith("//") ||
    value.startsWith(ADMIN_LOGIN_PATH)
  ) {
    return DEFAULT_ADMIN_PATH;
  }

  try {
    const parsed = new URL(value, "https://admin.local");
    if (parsed.origin !== "https://admin.local") {
      return DEFAULT_ADMIN_PATH;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_ADMIN_PATH;
  }
}
