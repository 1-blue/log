import {
  type AbortDocumentUploadRequest,
  type CompleteDocumentUploadRequest,
  CONTRACT_VERSION,
  DOCUMENT_RESUMABLE_THRESHOLD,
  type DocumentExtractionCallback,
  type DocumentType,
  type DocumentUploadMetadata,
  type DocumentVersion,
  type N8nDocumentExtractionDispatchPayload,
  type PublicDocumentDisposition,
  type UpdateDocumentVersionRequest,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DOCUMENT_BUCKET = "career-documents";
const UPLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1_000;
const DOWNLOAD_URL_TTL_SECONDS = 60;
const EXTRACTION_URL_TTL_SECONDS = 5 * 60;
const ORPHAN_MAX_AGE_MS = UPLOAD_TOKEN_TTL_MS;

type DocumentRow = Database["public"]["Tables"]["document_versions"]["Row"];

export type DocumentListFilters = {
  archived: "exclude" | "include" | "only";
  documentType?: DocumentType;
};

export type PreparedDocumentUpload = {
  documentVersionId: string;
  expiresAt: string | null;
  resumableEndpoint: string | null;
  storagePath: string;
  uploadMethod: "standard" | "tus";
  uploadToken: string | null;
};

export type DocumentDownloadUrl = {
  expiresAt: string;
  url: string;
};

export type PublicDocumentAccess = DocumentDownloadUrl & {
  documentType: DocumentType;
};

export function getDocumentUploadMethod(fileSize: number): "standard" | "tus" {
  return fileSize > DOCUMENT_RESUMABLE_THRESHOLD ? "tus" : "standard";
}

export class DocumentServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "DocumentServiceError";
  }
}

export interface DocumentService {
  clearPublication(ownerId: string, documentType: DocumentType): Promise<void>;
  cleanupOrphanedUploads(ownerId: string): Promise<void>;
  completeUpload(
    ownerId: string,
    documentVersionId: string,
    input: CompleteDocumentUploadRequest,
  ): Promise<DocumentVersion>;
  completeExtraction(
    ownerId: string,
    input: DocumentExtractionCallback,
  ): Promise<DocumentVersion>;
  createDownloadUrl(
    ownerId: string,
    documentVersionId: string,
    disposition: PublicDocumentDisposition,
  ): Promise<DocumentDownloadUrl>;
  createPublicAccessUrl(
    ownerId: string,
    documentType: DocumentType,
    disposition: PublicDocumentDisposition,
  ): Promise<PublicDocumentAccess>;
  get(ownerId: string, documentVersionId: string): Promise<DocumentVersion>;
  list(
    ownerId: string,
    filters: DocumentListFilters,
  ): Promise<DocumentVersion[]>;
  prepareUpload(
    ownerId: string,
    metadata: DocumentUploadMetadata,
  ): Promise<PreparedDocumentUpload>;
  prepareExtraction(
    ownerId: string,
    documentVersionId: string,
    requestId: string,
  ): Promise<N8nDocumentExtractionDispatchPayload | null>;
  failExtraction(
    ownerId: string,
    documentVersionId: string,
    errorCode: string,
  ): Promise<void>;
  abortUpload(
    ownerId: string,
    documentVersionId: string,
    input: AbortDocumentUploadRequest,
  ): Promise<"removed" | "preserved" | "not_found">;
  setPublication(
    ownerId: string,
    documentType: DocumentType,
    documentVersionId: string,
  ): Promise<DocumentVersion>;
  update(
    ownerId: string,
    documentVersionId: string,
    input: UpdateDocumentVersionRequest,
  ): Promise<DocumentVersion>;
}

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

function isUploadPathForDocument(
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

function toDocumentVersion(
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

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function getResumableEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  const projectRef = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];

  if (!projectRef) {
    return new URL("/storage/v1/upload/resumable", url).href;
  }

  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hasPdfSignature(bytes: Uint8Array): boolean {
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

async function inspectPdfObject(url: string) {
  return inspectPdfResponse(await fetch(url));
}

async function removeObjectBestEffort(
  supabase: SupabaseClient<Database>,
  storagePath: string,
): Promise<void> {
  await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
}

class SupabaseDocumentService implements DocumentService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly supabaseUrl: string,
  ) {}

  private async getRow(ownerId: string, documentVersionId: string) {
    const { data, error } = await this.supabase
      .from("document_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId)
      .maybeSingle();

    if (error) throw new DocumentServiceError("unavailable");
    if (!data) throw new DocumentServiceError("not_found");
    return data;
  }

  private async getPublishedVersionIds(ownerId: string) {
    const { data, error } = await this.supabase
      .from("document_publications")
      .select("document_version_id")
      .eq("owner_id", ownerId);

    if (error) throw new DocumentServiceError("unavailable");
    return new Set(data.map((publication) => publication.document_version_id));
  }

  private async createSignedDocumentUrl(
    row: DocumentRow,
    disposition: PublicDocumentDisposition,
    expiresIn = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<DocumentDownloadUrl> {
    const { data, error } = await this.supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(row.storage_path, expiresIn, {
        ...(disposition === "attachment"
          ? { download: row.original_filename }
          : {}),
      });

    if (error || !data?.signedUrl) {
      throw new DocumentServiceError("unavailable");
    }

    return {
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      url: data.signedUrl,
    };
  }

  async cleanupOrphanedUploads(ownerId: string): Promise<void> {
    try {
      const { data: referencedRows, error } = await this.supabase
        .from("document_versions")
        .select("storage_path")
        .eq("owner_id", ownerId);
      if (error) return;

      const referenced = new Set(
        referencedRows.map((version) => version.storage_path),
      );
      const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;

      for (const documentType of ["resume", "portfolio"] as const) {
        const folder = `${ownerId}/${documentType}`;
        const { data: objects, error: listError } = await this.supabase.storage
          .from(DOCUMENT_BUCKET)
          .list(folder, { limit: 100, sortBy: { column: "created_at" } });
        if (listError) continue;

        const stalePaths = objects
          .filter(
            (object) =>
              object.id &&
              object.created_at &&
              Date.parse(object.created_at) < cutoff &&
              /^(?:[0-9a-f-]{36}|.+-[0-9a-f]{6})\.pdf$/iu.test(object.name),
          )
          .map((object) => `${folder}/${object.name}`)
          .filter((path) => !referenced.has(path));

        if (stalePaths.length > 0) {
          await this.supabase.storage.from(DOCUMENT_BUCKET).remove(stalePaths);
        }
      }
    } catch {
      // Orphan cleanup is best-effort and must not block a new upload.
    }
  }

  async prepareUpload(
    ownerId: string,
    metadata: DocumentUploadMetadata,
  ): Promise<PreparedDocumentUpload> {
    await this.cleanupOrphanedUploads(ownerId);

    const { data: duplicate, error: duplicateError } = await this.supabase
      .from("document_versions")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("content_hash", metadata.contentHash)
      .limit(1)
      .maybeSingle();

    if (duplicateError) throw new DocumentServiceError("unavailable");
    if (duplicate) {
      throw new DocumentServiceError("conflict", {
        existingVersionId: duplicate.id,
        reason: "duplicate_content",
      });
    }

    const documentVersionId = crypto.randomUUID();
    const storagePath = getStoragePath(
      ownerId,
      metadata.documentType,
      documentVersionId,
      metadata.label,
    );
    const uploadMethod = getDocumentUploadMethod(metadata.fileSize);

    let uploadToken: string | null = null;
    let expiresAt: string | null = null;
    if (uploadMethod === "standard") {
      const { data, error } = await this.supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (error || !data?.token) {
        throw new DocumentServiceError("unavailable");
      }
      uploadToken = data.token;
      expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString();
    }

    return {
      documentVersionId,
      expiresAt,
      resumableEndpoint:
        uploadMethod === "tus" ? getResumableEndpoint(this.supabaseUrl) : null,
      storagePath,
      uploadMethod,
      uploadToken,
    };
  }

  async abortUpload(
    ownerId: string,
    documentVersionId: string,
    input: AbortDocumentUploadRequest,
  ): Promise<"removed" | "preserved" | "not_found"> {
    const { data: existing, error } = await this.supabase
      .from("document_versions")
      .select("storage_path")
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId)
      .maybeSingle();

    if (error) throw new DocumentServiceError("unavailable");
    if (existing) return "preserved";
    if (
      !isUploadPathForDocument(
        ownerId,
        input.documentType,
        documentVersionId,
        input.storagePath,
      )
    ) {
      throw new DocumentServiceError("validation", {
        reason: "invalid_storage_path",
      });
    }

    const { error: removeError } = await this.supabase.storage
      .from(DOCUMENT_BUCKET)
      .remove([input.storagePath]);
    if (removeError) throw new DocumentServiceError("unavailable");
    return "removed";
  }

  async completeUpload(
    ownerId: string,
    documentVersionId: string,
    input: CompleteDocumentUploadRequest,
  ): Promise<DocumentVersion> {
    if (
      !isUploadPathForDocument(
        ownerId,
        input.documentType,
        documentVersionId,
        input.storagePath,
      )
    ) {
      throw new DocumentServiceError("validation", {
        reason: "invalid_storage_path",
      });
    }

    const metadata = input;
    const { data: existing, error: existingError } = await this.supabase
      .from("document_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId)
      .maybeSingle();

    if (existingError) throw new DocumentServiceError("unavailable");
    if (existing) {
      return toDocumentVersion(
        existing,
        await this.getPublishedVersionIds(ownerId),
      );
    }

    const storagePath = input.storagePath;
    const bucket = this.supabase.storage.from(DOCUMENT_BUCKET);
    const { data: info, error: infoError } = await bucket.info(storagePath);

    if (infoError || !info) {
      throw new DocumentServiceError("conflict", {
        reason: "upload_incomplete",
      });
    }

    const { data: signedDownload, error: signedDownloadError } =
      await bucket.createSignedUrl(storagePath, DOWNLOAD_URL_TTL_SECONDS);
    if (signedDownloadError || !signedDownload?.signedUrl) {
      throw new DocumentServiceError("unavailable");
    }

    const inspected = await inspectPdfObject(signedDownload.signedUrl);
    const contentType = info.contentType?.split(";", 1)[0]?.toLowerCase();
    const invalidFile =
      info.size !== metadata.fileSize ||
      inspected.fileSize !== metadata.fileSize ||
      contentType !== "application/pdf" ||
      !inspected.validSignature ||
      inspected.contentHash !== metadata.contentHash;

    if (invalidFile) {
      await removeObjectBestEffort(this.supabase, storagePath);
      throw new DocumentServiceError("validation", {
        reason: "uploaded_file_mismatch",
      });
    }

    const { data: duplicate, error: duplicateError } = await this.supabase
      .from("document_versions")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("content_hash", inspected.contentHash)
      .limit(1)
      .maybeSingle();

    if (duplicateError) throw new DocumentServiceError("unavailable");
    if (duplicate) {
      await removeObjectBestEffort(this.supabase, storagePath);
      throw new DocumentServiceError("conflict", {
        existingVersionId: duplicate.id,
        reason: "duplicate_content",
      });
    }

    const { data, error } = await this.supabase.rpc(
      "register_document_version",
      {
        p_content_hash: inspected.contentHash,
        p_document_type: metadata.documentType,
        p_file_size: inspected.fileSize,
        p_id: documentVersionId,
        p_label: metadata.label,
        p_mime_type: "application/pdf",
        p_original_filename: metadata.originalFilename,
        p_owner_id: ownerId,
        p_storage_path: storagePath,
      },
    );

    if (error || !data) throw new DocumentServiceError("unavailable");
    return toDocumentVersion(data, new Set());
  }

  async prepareExtraction(
    ownerId: string,
    documentVersionId: string,
    requestId: string,
  ): Promise<N8nDocumentExtractionDispatchPayload | null> {
    const row = await this.getRow(ownerId, documentVersionId);
    if (row.extraction_status === "ready" && row.extracted_text?.trim()) {
      return null;
    }

    const download = await this.createSignedDocumentUrl(
      row,
      "inline",
      EXTRACTION_URL_TTL_SECONDS,
    );
    const { error } = await this.supabase
      .from("document_versions")
      .update({ extraction_error: null, extraction_status: "processing" })
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId);
    if (error) throw new DocumentServiceError("unavailable");

    return {
      callbackPath: `/v1/internal/document-versions/${documentVersionId}/extract`,
      document: {
        contentHash: row.content_hash,
        downloadUrl: download.url,
        fileSize: row.file_size,
        id: row.id,
        type: row.document_type,
      },
      eventId: crypto.randomUUID(),
      kind: "document_extraction",
      requestId,
      schemaVersion: CONTRACT_VERSION,
    };
  }

  async failExtraction(
    ownerId: string,
    documentVersionId: string,
    errorCode: string,
  ): Promise<void> {
    await this.supabase
      .from("document_versions")
      .update({ extraction_error: errorCode, extraction_status: "failed" })
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId);
  }

  async completeExtraction(
    ownerId: string,
    input: DocumentExtractionCallback,
  ): Promise<DocumentVersion> {
    const current = await this.getRow(ownerId, input.documentVersionId);
    if (current.content_hash !== input.contentHash) {
      throw new DocumentServiceError("conflict", {
        reason: "stale_extraction_callback",
      });
    }

    const extractedText = input.extractedText?.trim() || null;
    if (input.outcome === "ready" && !extractedText) {
      throw new DocumentServiceError("validation", {
        reason: "empty_extracted_text",
      });
    }

    const { error } = await this.supabase
      .from("document_versions")
      .update({
        extracted_text: input.outcome === "ready" ? extractedText : null,
        extraction_error: input.errorCode,
        extraction_status: input.outcome === "ready" ? "ready" : "failed",
      })
      .eq("owner_id", ownerId)
      .eq("id", input.documentVersionId);
    if (error) throw new DocumentServiceError("unavailable");
    return this.get(ownerId, input.documentVersionId);
  }

  async list(ownerId: string, filters: DocumentListFilters) {
    let query = this.supabase
      .from("document_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (filters.documentType) {
      query = query.eq("document_type", filters.documentType);
    }
    if (filters.archived === "exclude") query = query.is("archived_at", null);
    if (filters.archived === "only")
      query = query.not("archived_at", "is", null);

    const [{ data, error }, publishedVersionIds] = await Promise.all([
      query,
      this.getPublishedVersionIds(ownerId),
    ]);

    if (error) throw new DocumentServiceError("unavailable");
    return data.map((row) => toDocumentVersion(row, publishedVersionIds));
  }

  async get(ownerId: string, documentVersionId: string) {
    const [row, publishedVersionIds] = await Promise.all([
      this.getRow(ownerId, documentVersionId),
      this.getPublishedVersionIds(ownerId),
    ]);
    return toDocumentVersion(row, publishedVersionIds);
  }

  async update(
    ownerId: string,
    documentVersionId: string,
    input: UpdateDocumentVersionRequest,
  ) {
    const current = await this.getRow(ownerId, documentVersionId);

    if (input.action === "set_default") {
      if (current.archived_at) {
        throw new DocumentServiceError("conflict", {
          reason: "archived_document",
        });
      }

      const { error } = await this.supabase.rpc(
        "set_default_document_version",
        {
          p_document_type: current.document_type,
          p_document_version_id: documentVersionId,
          p_owner_id: ownerId,
        },
      );
      if (error) throw new DocumentServiceError("unavailable");
      return this.get(ownerId, documentVersionId);
    }

    if (input.action === "set_archived") {
      if (
        input.archived &&
        (await this.getPublishedVersionIds(ownerId)).has(documentVersionId)
      ) {
        throw new DocumentServiceError("conflict", {
          reason: "published_document",
        });
      }

      const { error } = await this.supabase
        .from("document_versions")
        .update({
          archived_at: input.archived ? new Date().toISOString() : null,
          ...(input.archived ? { is_default: false } : {}),
        })
        .eq("owner_id", ownerId)
        .eq("id", documentVersionId);
      if (error) throw new DocumentServiceError("unavailable");
      return this.get(ownerId, documentVersionId);
    }

    const extractedText =
      input.extractedText === undefined
        ? undefined
        : input.extractedText?.trim() || null;
    const { error } = await this.supabase
      .from("document_versions")
      .update({
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(extractedText === undefined
          ? {}
          : {
              extracted_text: extractedText,
              extraction_error: null,
              extraction_status: extractedText ? "ready" : "pending",
            }),
      })
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId);
    if (error) throw new DocumentServiceError("unavailable");
    return this.get(ownerId, documentVersionId);
  }

  async setPublication(
    ownerId: string,
    documentType: DocumentType,
    documentVersionId: string,
  ) {
    const row = await this.getRow(ownerId, documentVersionId);
    if (row.document_type !== documentType || row.archived_at) {
      throw new DocumentServiceError("conflict", {
        reason: row.archived_at
          ? "archived_document"
          : "document_type_mismatch",
      });
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase.from("document_publications").upsert(
      {
        document_type: documentType,
        document_version_id: documentVersionId,
        owner_id: ownerId,
        published_at: now,
      },
      { onConflict: "owner_id,document_type" },
    );
    if (error) throw new DocumentServiceError("unavailable");
    return this.get(ownerId, documentVersionId);
  }

  async clearPublication(ownerId: string, documentType: DocumentType) {
    const { error } = await this.supabase
      .from("document_publications")
      .delete()
      .eq("owner_id", ownerId)
      .eq("document_type", documentType);
    if (error) throw new DocumentServiceError("unavailable");
  }

  async createDownloadUrl(
    ownerId: string,
    documentVersionId: string,
    disposition: PublicDocumentDisposition,
  ) {
    const row = await this.getRow(ownerId, documentVersionId);
    return this.createSignedDocumentUrl(row, disposition);
  }

  async createPublicAccessUrl(
    ownerId: string,
    documentType: DocumentType,
    disposition: PublicDocumentDisposition,
  ) {
    const { data: publication, error } = await this.supabase
      .from("document_publications")
      .select("document_version_id")
      .eq("owner_id", ownerId)
      .eq("document_type", documentType)
      .maybeSingle();

    if (error) throw new DocumentServiceError("unavailable");
    if (!publication) {
      throw new DocumentServiceError("not_found", {
        reason: "publication_not_found",
      });
    }

    const row = await this.getRow(ownerId, publication.document_version_id);
    if (row.document_type !== documentType || row.archived_at) {
      throw new DocumentServiceError("not_found", {
        reason: "publication_not_found",
      });
    }

    return {
      ...(await this.createSignedDocumentUrl(row, disposition)),
      documentType,
    };
  }
}

export function createDocumentService(
  env: CloudflareBindings,
): DocumentService {
  return new SupabaseDocumentService(
    createSupabaseAdminClient(env),
    env.SUPABASE_URL,
  );
}
