import type { MiddlewareHandler } from "hono";

import { enforceRateLimit, errorResponse } from "./app-response.js";
import type { AppDependencies, WorkerAppEnv } from "./app-types.js";
import { verifySupabaseAdminToken, WorkerAuthError } from "./auth.js";

export function createRequireAdmin(
  dependencies: AppDependencies,
): MiddlewareHandler<WorkerAppEnv> {
  return async (c, next) => {
    const authorization = c.req.header("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match?.[1]) {
      return errorResponse(c, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }

    let userId: string;
    try {
      const verified = await verifySupabaseAdminToken(
        match[1],
        c.env,
        dependencies.jwtVerificationKey,
      );
      userId = verified.userId;
    } catch (error) {
      if (error instanceof WorkerAuthError) {
        if (error.kind === "forbidden") {
          return errorResponse(c, 403, "FORBIDDEN", "관리자 권한이 없습니다.");
        }

        if (error.kind === "unavailable") {
          return errorResponse(
            c,
            503,
            "UPSTREAM_UNAVAILABLE",
            "인증 서비스를 사용할 수 없습니다.",
            true,
          );
        }
      }

      return errorResponse(
        c,
        401,
        "UNAUTHORIZED",
        "로그인 세션이 유효하지 않습니다.",
      );
    }

    c.set("adminUserId", userId);
    const rateLimitResponse = await enforceRateLimit(
      c,
      c.env.ADMIN_API_RATE_LIMITER,
      `admin:${userId}`,
    );
    if (rateLimitResponse) return rateLimitResponse;
    await next();
  };
}
