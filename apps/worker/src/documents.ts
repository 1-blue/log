import {
  type AbortDocumentUploadRequest,
  type CompleteDocumentUploadRequest,
  CONTRACT_VERSION,
  DocumentAnalysisProfileSchema,
  type DocumentExtractionCallback,
  type DocumentType,
  type DocumentUploadMetadata,
  type DocumentVersion,
  type N8nDocumentExtractionDispatchPayload,
  type PublicDocumentDisposition,
  type SaveDocumentEvidenceReviewRequest,
  type UpdateDocumentVersionRequest,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

import {
  type DocumentDownloadUrl,
  type DocumentListFilters,
  type DocumentRow,
  type DocumentService,
  DocumentServiceError,
  getDocumentUploadMethod,
  type PreparedDocumentUpload,
} from "./document-service-contract.js";
import {
  createSupabaseAdminClient,
  DOCUMENT_BUCKET,
  DOWNLOAD_URL_TTL_SECONDS,
  EXTRACTION_STALE_AFTER_MS,
  EXTRACTION_URL_TTL_SECONDS,
  getResumableEndpoint,
  getStoragePath,
  inspectPdfObject,
  isUploadPathForDocument,
  mapDocumentVersion as toDocumentVersion,
  mapEvidenceReview as toEvidenceReview,
  ORPHAN_MAX_AGE_MS,
  removeObjectBestEffort,
  UPLOAD_TOKEN_TTL_MS,
} from "./document-service-support.js";
import { toOpenAiStructuredOutputSchema } from "./openai-schema.js";

export type {
  DocumentListFilters,
  DocumentService,
} from "./document-service-contract.js";
export {
  DocumentServiceError,
  getDocumentUploadMethod,
} from "./document-service-contract.js";
export {
  getStoragePath,
  inspectPdfResponse,
} from "./document-service-support.js";

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
        let offset = 0;
        const pageSize = 100;
        while (true) {
          const { data: objects, error: listError } =
            await this.supabase.storage.from(DOCUMENT_BUCKET).list(folder, {
              limit: pageSize,
              offset,
              sortBy: { column: "created_at" },
            });
          if (listError) break;

          const stalePaths = objects
            .filter(
              (object) =>
                object.created_at &&
                Date.parse(object.created_at) < cutoff &&
                /^(?:[0-9a-f-]{36}|.+-[0-9a-f]{6})\.pdf$/iu.test(object.name),
            )
            .map((object) => `${folder}/${object.name}`)
            .filter((path) => !referenced.has(path));

          const removedCount = stalePaths.length;
          if (removedCount > 0) {
            await this.supabase.storage
              .from(DOCUMENT_BUCKET)
              .remove(stalePaths);
          }
          if (objects.length < pageSize) break;
          if (removedCount === 0) offset += pageSize;
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
    try {
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
    } catch (error) {
      // Once an object exists, every failed completion path must attempt cleanup.
      // The scheduled orphan sweep remains the fallback if Storage is temporarily unavailable.
      await removeObjectBestEffort(this.supabase, storagePath).catch(
        () => undefined,
      );
      throw error;
    }
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
    if (
      row.extraction_status === "processing" &&
      Date.parse(row.updated_at) > Date.now() - EXTRACTION_STALE_AFTER_MS
    ) {
      return null;
    }

    const eventId = crypto.randomUUID();
    const { data: started, error } = await this.supabase.rpc(
      "begin_document_extraction",
      {
        p_owner_id: ownerId,
        p_document_id: documentVersionId,
        p_event_id: eventId,
      },
    );
    if (error) throw new DocumentServiceError("unavailable");
    if (!started) return null;

    let download: DocumentDownloadUrl;
    try {
      download = await this.createSignedDocumentUrl(
        row,
        "inline",
        EXTRACTION_URL_TTL_SECONDS,
      );
    } catch {
      await this.failExtraction(
        ownerId,
        documentVersionId,
        "EXTRACTION_DISPATCH_FAILED",
        eventId,
      );
      throw new DocumentServiceError("unavailable");
    }

    return {
      callbackPath: `/v1/internal/document-versions/${documentVersionId}/extract`,
      document: {
        contentHash: row.content_hash,
        downloadUrl: download.url,
        fileSize: row.file_size,
        id: row.id,
        type: row.document_type,
      },
      eventId,
      kind: "document_extraction",
      outputSchema: toOpenAiStructuredOutputSchema(
        z.toJSONSchema(DocumentAnalysisProfileSchema, { target: "draft-07" }),
      ),
      requestId,
      schemaVersion: CONTRACT_VERSION,
    };
  }

  async failExtraction(
    ownerId: string,
    documentVersionId: string,
    errorCode: string,
    eventId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("document_versions")
      .update({ extraction_error: errorCode, extraction_status: "failed" })
      .eq("owner_id", ownerId)
      .eq("id", documentVersionId)
      .eq("extraction_event_id", eventId)
      .eq("extraction_status", "processing");
    if (error) throw new DocumentServiceError("unavailable");
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

    if (
      current.extraction_status !== "processing" ||
      (current.extraction_event_id &&
        current.extraction_event_id !== input.eventId)
    ) {
      return this.get(ownerId, input.documentVersionId);
    }

    const extractedText = input.extractedText?.trim() || null;
    if (input.outcome === "ready" && !extractedText) {
      throw new DocumentServiceError("validation", {
        reason: "empty_extracted_text",
      });
    }

    if (input.profile) {
      const profile = DocumentAnalysisProfileSchema.safeParse(input.profile);
      if (!profile.success) {
        throw new DocumentServiceError("validation", {
          reason: "invalid_document_analysis_profile",
        });
      }
    }

    const { error } = await this.supabase.rpc("finish_document_extraction", {
      p_owner_id: ownerId,
      p_document_id: input.documentVersionId,
      p_event_id: input.eventId,
      p_content_hash: input.contentHash,
      p_text: input.outcome === "ready" ? (extractedText ?? "") : "",
      p_error: input.errorCode ?? "",
      p_source: input.extractionSource ?? "pdf",
      p_profile: input.profile ?? null,
      p_profile_metadata: input.profileMetadata ?? null,
    });
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

  async listEvidenceReviews(ownerId: string, documentVersionId: string) {
    await this.getRow(ownerId, documentVersionId);
    const { data, error } = await this.supabase
      .from("document_evidence_reviews")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("document_version_id", documentVersionId)
      .order("updated_at", { ascending: false });
    if (error) throw new DocumentServiceError("unavailable");
    return data.map(toEvidenceReview);
  }

  async saveEvidenceReview(
    ownerId: string,
    documentVersionId: string,
    input: SaveDocumentEvidenceReviewRequest,
  ) {
    const document = await this.getRow(ownerId, documentVersionId);
    const { data: profile, error: profileError } = await this.supabase
      .from("document_analysis_profiles")
      .select("id")
      .eq("id", input.profileId)
      .eq("owner_id", ownerId)
      .eq("document_version_id", documentVersionId)
      .maybeSingle();
    if (profileError) throw new DocumentServiceError("unavailable");
    if (!profile)
      throw new DocumentServiceError("validation", {
        reason: "evidence_profile_mismatch",
      });

    const { data, error } = await this.supabase
      .from("document_evidence_reviews")
      .upsert(
        {
          document_type: document.document_type,
          document_version_id: documentVersionId,
          evidence_key: input.evidenceKey,
          excerpt: input.excerpt,
          note: input.note,
          observation: input.observation,
          owner_id: ownerId,
          page: input.page,
          profile_id: input.profileId,
          section: input.section,
          status: input.status,
        },
        { onConflict: "owner_id,profile_id,evidence_key" },
      )
      .select("*")
      .single();
    if (error || !data) throw new DocumentServiceError("unavailable");
    return toEvidenceReview(data);
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
              extraction_event_id: null,
              extraction_source: extractedText ? "manual" : null,
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
