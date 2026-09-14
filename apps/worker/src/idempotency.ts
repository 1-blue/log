import type { Database, Json } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ClaimInput = {
  executionId: string;
  idempotencyKey: string;
  method: string;
  ownerId: string;
  path: string;
  requestFingerprint: string;
  requestId: string;
};

export type IdempotencyClaim =
  | { kind: "claimed"; executionId: string }
  | { kind: "conflict" }
  | { kind: "in_progress" }
  | {
      body: unknown;
      kind: "replay";
      requestId: string;
      status: number;
    };

export interface IdempotencyService {
  claim(input: ClaimInput): Promise<IdempotencyClaim>;
  complete(input: {
    body: unknown;
    executionId: string;
    idempotencyKey: string;
    ownerId: string;
    status: number;
  }): Promise<void>;
  release(input: {
    executionId: string;
    idempotencyKey: string;
    ownerId: string;
  }): Promise<void>;
}

type ClaimRow = {
  outcome: "claimed" | "conflict" | "in_progress" | "replay";
  stored_execution_id: string;
  stored_request_id: string;
  stored_response_body: Json | null;
  stored_response_status: number | null;
};

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export async function createRequestFingerprint(input: {
  body: unknown;
  method: string;
  path: string;
}): Promise<string> {
  return sha256Hex(
    `${input.method.toUpperCase()}\n${input.path}\n${canonicalJson(input.body)}`,
  );
}

class SupabaseIdempotencyService implements IdempotencyService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async claim(input: ClaimInput): Promise<IdempotencyClaim> {
    const { data, error } = await this.supabase.rpc(
      "claim_api_idempotency_request",
      {
        p_execution_id: input.executionId,
        p_idempotency_key: input.idempotencyKey,
        p_owner_id: input.ownerId,
        p_request_fingerprint: input.requestFingerprint,
        p_request_id: input.requestId,
        p_request_method: input.method,
        p_request_path: input.path,
      },
    );
    if (error) throw error;

    const row = (data as ClaimRow[] | null)?.[0];
    if (!row) throw new Error("Idempotency claim returned no result");
    if (row.outcome === "claimed") {
      return { executionId: row.stored_execution_id, kind: "claimed" };
    }
    if (row.outcome === "replay") {
      if (
        row.stored_response_status === null ||
        row.stored_response_body === null
      ) {
        throw new Error("Completed idempotency record has no response");
      }
      return {
        body: row.stored_response_body,
        kind: "replay",
        requestId: row.stored_request_id,
        status: row.stored_response_status,
      };
    }
    return { kind: row.outcome };
  }

  async complete(input: {
    body: unknown;
    executionId: string;
    idempotencyKey: string;
    ownerId: string;
    status: number;
  }) {
    const { error } = await this.supabase.rpc(
      "complete_api_idempotency_request",
      {
        p_execution_id: input.executionId,
        p_idempotency_key: input.idempotencyKey,
        p_owner_id: input.ownerId,
        p_response_body: input.body as Json,
        p_response_status: input.status,
      },
    );
    if (error) throw error;
  }

  async release(input: {
    executionId: string;
    idempotencyKey: string;
    ownerId: string;
  }) {
    const { error } = await this.supabase.rpc(
      "release_api_idempotency_request",
      {
        p_execution_id: input.executionId,
        p_idempotency_key: input.idempotencyKey,
        p_owner_id: input.ownerId,
      },
    );
    if (error) throw error;
  }
}

export function createIdempotencyService(
  env: CloudflareBindings,
): IdempotencyService {
  return new SupabaseIdempotencyService(createSupabaseAdminClient(env));
}
