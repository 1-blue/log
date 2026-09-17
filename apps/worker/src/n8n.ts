import type {
  N8nDispatchPayload,
  N8nDocumentExtractionDispatchPayload,
  N8nJobPostingCollectionDispatchPayload,
  N8nJobPostingExtractionDispatchPayload,
  N8nSlackNotificationDispatchPayload,
} from "@workspace/contracts";

const encoder = new TextEncoder();
const SIGNATURE_VERSION = "v1";
export const N8N_REQUEST_TIMEOUT_MS = 5_000;
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const SIGNATURE_HEADERS = {
  eventId: "X-Event-Id",
  requestId: "X-Request-Id",
  signature: "X-Signature",
  timestamp: "X-Signature-Timestamp",
} as const;

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

async function digestBody(body: Uint8Array): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", body));
}

async function importHmacKey(secret: string, usage: "sign" | "verify") {
  if (!secret) throw new Error("HMAC secret is missing");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    [usage],
  );
}

async function canonicalRequest(input: {
  body: Uint8Array;
  eventId: string;
  method: string;
  path: string;
  requestId: string;
  timestamp: number;
}) {
  const bodyHash = await digestBody(input.body);
  return [
    SIGNATURE_VERSION,
    String(input.timestamp),
    input.eventId,
    input.requestId,
    input.method.toUpperCase(),
    input.path,
    bodyHash,
  ].join("\n");
}

export async function createSignedHeaders(input: {
  body: Uint8Array;
  eventId: string;
  method: string;
  path: string;
  requestId: string;
  secret: string;
  timestamp: number;
}): Promise<Headers> {
  const canonical = await canonicalRequest(input);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(input.secret, "sign"),
    encoder.encode(canonical),
  );
  return new Headers({
    "Content-Type": "application/json",
    [SIGNATURE_HEADERS.eventId]: input.eventId,
    [SIGNATURE_HEADERS.requestId]: input.requestId,
    [SIGNATURE_HEADERS.signature]: `${SIGNATURE_VERSION}=${bytesToHex(signature)}`,
    [SIGNATURE_HEADERS.timestamp]: String(input.timestamp),
  });
}

export type VerifiedSignedRequest = {
  body: Uint8Array;
  eventId: string;
  requestId: string;
};

export async function verifySignedRequest(input: {
  now?: number;
  request: Request;
  secret: string;
}): Promise<VerifiedSignedRequest | null> {
  const eventId = input.request.headers.get(SIGNATURE_HEADERS.eventId);
  const requestId = input.request.headers.get(SIGNATURE_HEADERS.requestId);
  const timestampValue = input.request.headers.get(SIGNATURE_HEADERS.timestamp);
  const signatureValue = input.request.headers.get(SIGNATURE_HEADERS.signature);
  const timestamp = Number(timestampValue);
  const signatureMatch = signatureValue?.match(/^v1=([0-9a-f]{64})$/i);

  if (
    !eventId ||
    !requestId ||
    !timestampValue ||
    !Number.isInteger(timestamp) ||
    !signatureMatch?.[1]
  ) {
    return null;
  }

  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return null;

  const body = new Uint8Array(await input.request.clone().arrayBuffer());
  const canonical = await canonicalRequest({
    body,
    eventId,
    method: input.request.method,
    path: new URL(input.request.url).pathname,
    requestId,
    timestamp,
  });
  const signature = hexToBytes(signatureMatch[1]);
  if (!signature) return null;

  const verified = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(input.secret, "verify"),
    signature,
    encoder.encode(canonical),
  );
  return verified ? { body, eventId, requestId } : null;
}

export class N8nDispatchError extends Error {
  constructor(
    readonly kind: "rejected" | "timeout" | "unavailable",
    readonly retryable: boolean,
  ) {
    super(kind);
    this.name = "N8nDispatchError";
  }
}

export async function dispatchToN8n(
  payload:
    | N8nDispatchPayload
    | N8nDocumentExtractionDispatchPayload
    | N8nJobPostingCollectionDispatchPayload
    | N8nJobPostingExtractionDispatchPayload
    | N8nSlackNotificationDispatchPayload,
  env: Pick<CloudflareBindings, "N8N_WEBHOOK_SECRET" | "N8N_WEBHOOK_URL">,
  options: {
    fetcher?: typeof fetch;
    now?: number;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  const url = new URL(env.N8N_WEBHOOK_URL);
  const body = encoder.encode(JSON.stringify(payload));
  const timestamp = options.now ?? Math.floor(Date.now() / 1_000);
  const headers = await createSignedHeaders({
    body,
    eventId: payload.eventId,
    method: "POST",
    path: url.pathname,
    requestId: payload.requestId,
    secret: env.N8N_WEBHOOK_SECRET,
    timestamp,
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? N8N_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetcher ?? fetch)(url, {
      body,
      headers,
      method: "POST",
      signal: controller.signal,
    });
    if (response.ok) return;
    if (response.status === 429 || response.status >= 500) {
      throw new N8nDispatchError("unavailable", true);
    }
    throw new N8nDispatchError("rejected", false);
  } catch (error) {
    if (error instanceof N8nDispatchError) throw error;
    if (controller.signal.aborted) {
      throw new N8nDispatchError("timeout", true);
    }
    throw new N8nDispatchError("unavailable", true);
  } finally {
    clearTimeout(timeout);
  }
}
