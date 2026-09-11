import "server-only";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAdminUserId(): string {
  const userId = process.env.ADMIN_USER_ID;

  if (!userId) {
    throw new Error("ADMIN_USER_ID 환경변수가 설정되지 않았습니다.");
  }

  if (!UUID_PATTERN.test(userId)) {
    throw new Error("ADMIN_USER_ID 환경변수가 올바른 UUID가 아닙니다.");
  }

  return userId;
}
