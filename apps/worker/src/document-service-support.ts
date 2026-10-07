import type {
  DocumentEvidenceReview,
  DocumentType,
  DocumentVersion,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  type DocumentRow,
  DocumentServiceError,
  type EvidenceReviewRow,
} from "./document-service-contract.js";

export const DOCUMENT_BUCKET = "career-documents";
export const UPLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1_000;
export const DOWNLOAD_URL_TTL_SECONDS = 60;
export const EXTRACTION_URL_TTL_SECONDS = 5 * 60;
export const ORPHAN_MAX_AGE_MS = UPLOAD_TOKEN_TTL_MS;
export const EXTRACTION_STALE_AFTER_MS = 15 * 60 * 1_000;

export function getStoragePath(
  ownerId: string,
  documentType: DocumentType,
  documentVersionId: string,
  label?: string,
): string {
  const shortId = documentVersionId.replaceAll("-", "").slice(0, 6);
  if (!label) return `${ownerId}/${documentType}/${documentVersionId}.pdf`;

  const safeLabel = label
    .normalize("NFKD")
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/^-+|-+$/gu, "");

  return `${ownerId}/${documentType}/${safeLabel || documentType}-${shortId}.pdf`;
}

export function isUploadPathForDocument(
  ownerId: string,
  documentType: DocumentType,
  documentVersionId: string,
  storagePath: string,
): boolean {
  const oldPath = getStoragePath(ownerId, documentType, documentVersionId);
  if (storagePath === oldPath) return true;

  const prefix = `${ownerId}/${documentType}/`;
  const shortId = documentVersionId.replaceAll("-", "").slice(0, 6);
  const filename = storagePath.startsWith(prefix)
    ? storagePath.slice(prefix.length)
    : "";

  return (
    /^[A-Za-z0-9_-]+-[0-9a-f]{6}\.pdf$/u.test(filename) &&
    filename.endsWith(`-${shortId}.pdf`) &&
    !filename.includes("/") &&
    !filename.includes("\\")
  );
}

export function mapDocumentVersion(
  row: DocumentRow,
  publishedVersionIds: ReadonlySet<string>,
): DocumentVersion {
  return {
    archivedAt: row.archived_at,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    documentType: row.document_type,
    extractedText: row.extracted_text,
    extractionStatus: row.extraction_status,
    extractionError: row.extraction_error as DocumentVersion["extractionError"],
    extractionSource:
      row.extraction_source as DocumentVersion["extractionSource"],
    fileSize: row.file_size,
    id: row.id,
    isDefault: row.is_default,
    isPublished: publishedVersionIds.has(row.id),
    label: row.label,
    mimeType: "application/pdf",
    originalFilename: row.original_filename,
    updatedAt: row.updated_at,
  };
}

export function mapEvidenceReview(
  row: EvidenceReviewRow,
): DocumentEvidenceReview {
  return {
    createdAt: row.created_at,
    documentVersionId: row.document_version_id,
    evidenceKey: row.evidence_key,
    excerpt: row.excerpt,
    id: row.id,
    note: row.note,
    observation: row.observation,
    page: row.page,
    profileId: row.profile_id,
    section: row.section,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function getResumableEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  const projectRef = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];

  if (!projectRef) {
    return new URL("/storage/v1/upload/resumable", url).href;
  }

  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function inspectPdfResponse(response: Response) {
  if (!response.ok || !response.body) {
    throw new DocumentServiceError("unavailable");
  }

  if (typeof DigestStream === "undefined") {
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return {
      contentHash: toHex(await crypto.subtle.digest("SHA-256", buffer)),
      fileSize: bytes.byteLength,
      validSignature: hasPdfSignature(bytes),
    };
  }

  const digestStream = new DigestStream("SHA-256");
  const digestWriter = digestStream.getWriter();
  const reader = response.body.getReader();
  const signature = new Uint8Array(5);
  let signatureLength = 0;
  let fileSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileSize += value.byteLength;
      if (signatureLength < signature.length) {
        const bytesToCopy = Math.min(
          signature.length - signatureLength,
          value.byteLength,
        );
        signature.set(value.subarray(0, bytesToCopy), signatureLength);
        signatureLength += bytesToCopy;
      }
      await digestWriter.write(value);
    }
    await digestWriter.close();
  } catch (error) {
    await digestWriter.abort(error).catch(() => undefined);
    throw new DocumentServiceError("unavailable");
  } finally {
    reader.releaseLock();
  }

  return {
    contentHash: toHex(await digestStream.digest),
    fileSize,
    validSignature:
      signatureLength === signature.length && hasPdfSignature(signature),
  };
}

export async function inspectPdfObject(url: string) {
  return inspectPdfResponse(await fetch(url));
}

export async function removeObjectBestEffort(
  supabase: SupabaseClient<Database>,
  storagePath: string,
): Promise<void> {
  await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
}
