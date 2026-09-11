import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import * as z from "zod";

const UuidSchema = z.uuid();
const ALLOWED_ALGORITHMS = ["ES256", "RS256"] as const;

const remoteJwksByUrl = new Map<string, JWTVerifyGetKey>();

export type JwtVerificationKey = CryptoKey | JWTVerifyGetKey;

export class WorkerAuthError extends Error {
  constructor(readonly kind: "forbidden" | "unauthorized" | "unavailable") {
    super(kind);
    this.name = "WorkerAuthError";
  }
}

function getSupabaseAuthUrls(supabaseUrl: string) {
  let baseUrl: URL;

  try {
    baseUrl = new URL(supabaseUrl);
  } catch {
    throw new WorkerAuthError("unavailable");
  }

  if (baseUrl.protocol !== "https:") {
    throw new WorkerAuthError("unavailable");
  }

  return {
    issuer: new URL("/auth/v1", baseUrl).href.replace(/\/$/, ""),
    jwksUrl: new URL("/auth/v1/.well-known/jwks.json", baseUrl),
  };
}

function getRemoteJwks(url: URL): JWTVerifyGetKey {
  const key = url.href;
  const cached = remoteJwksByUrl.get(key);

  if (cached) return cached;

  const jwks = createRemoteJWKSet(url);
  remoteJwksByUrl.set(key, jwks);
  return jwks;
}

function isInvalidTokenError(error: unknown): boolean {
  return (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWSSignatureVerificationFailed
  );
}

export async function verifySupabaseAdminToken(
  token: string,
  env: CloudflareBindings,
  verificationKey?: JwtVerificationKey,
): Promise<{ userId: string }> {
  const { issuer, jwksUrl } = getSupabaseAuthUrls(env.SUPABASE_URL);
  const adminUserId = UuidSchema.safeParse(env.ADMIN_USER_ID);

  if (!adminUserId.success) {
    throw new WorkerAuthError("unavailable");
  }

  try {
    const key = verificationKey ?? getRemoteJwks(jwksUrl);
    const options = {
      algorithms: [...ALLOWED_ALGORITHMS],
      audience: "authenticated",
      issuer,
    };
    const { payload } =
      typeof key === "function"
        ? await jwtVerify(token, key, options)
        : await jwtVerify(token, key, options);

    const subject = payload.sub;
    if (
      payload.role !== "authenticated" ||
      typeof subject !== "string" ||
      !UuidSchema.safeParse(subject).success
    ) {
      throw new WorkerAuthError("unauthorized");
    }

    if (subject !== adminUserId.data) {
      throw new WorkerAuthError("forbidden");
    }

    return { userId: subject };
  } catch (error) {
    if (error instanceof WorkerAuthError) throw error;
    if (isInvalidTokenError(error)) {
      throw new WorkerAuthError("unauthorized");
    }

    throw new WorkerAuthError("unavailable");
  }
}
