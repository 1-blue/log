import * as z from "zod";

import {
  DocumentContentHashSchema,
  DocumentFilenameSchema,
  DocumentLabelSchema,
} from "./common";
import {
  DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH,
  DOCUMENT_MAX_FILE_SIZE,
  DocumentExtractionStatusSchema,
  DocumentTypeSchema,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

export const DocumentUploadMetadataSchema = z.strictObject({
  documentType: DocumentTypeSchema,
  label: DocumentLabelSchema,
  originalFilename: DocumentFilenameSchema,
  mimeType: z.literal("application/pdf"),
  fileSize: z.int().min(1).max(DOCUMENT_MAX_FILE_SIZE),
  contentHash: DocumentContentHashSchema,
});

export type DocumentUploadMetadata = z.infer<
  typeof DocumentUploadMetadataSchema
>;

export const PrepareDocumentUploadRequestSchema = DocumentUploadMetadataSchema;

export type PrepareDocumentUploadRequest = z.infer<
  typeof PrepareDocumentUploadRequestSchema
>;

const DocumentStoragePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.includes("//") &&
      /^[\x20-\x7E]+$/u.test(value) &&
      Array.from(value).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
      }),
    "A valid storage object path is required",
  );

export const CompleteDocumentUploadRequestSchema =
  DocumentUploadMetadataSchema.extend({
    storagePath: DocumentStoragePathSchema,
  }).strict();

export type CompleteDocumentUploadRequest = z.infer<
  typeof CompleteDocumentUploadRequestSchema
>;

export const AbortDocumentUploadRequestSchema = z.strictObject({
  documentType: DocumentTypeSchema,
  storagePath: DocumentStoragePathSchema,
});

export type AbortDocumentUploadRequest = z.infer<
  typeof AbortDocumentUploadRequestSchema
>;

export const DocumentUploadMethodSchema = z.enum(["standard", "tus"]);

export type DocumentUploadMethod = z.infer<typeof DocumentUploadMethodSchema>;

const PreparedDocumentUploadBaseSchema = z.strictObject({
  documentVersionId: UuidSchema,
  storagePath: DocumentStoragePathSchema,
  uploadMethod: DocumentUploadMethodSchema,
  resumableEndpoint: z.url().nullable(),
  expiresAt: Rfc3339TimestampSchema.nullable(),
});

export const PrepareDocumentUploadResponseSchema = z.strictObject({
  data: z.discriminatedUnion("uploadMethod", [
    PreparedDocumentUploadBaseSchema.extend({
      uploadMethod: z.literal("standard"),
      resumableEndpoint: z.null(),
      expiresAt: Rfc3339TimestampSchema,
      uploadToken: z.string().min(1),
    }).strict(),
    PreparedDocumentUploadBaseSchema.extend({
      uploadMethod: z.literal("tus"),
      resumableEndpoint: z.url(),
      expiresAt: z.null(),
      uploadToken: z.null(),
    }).strict(),
  ]),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type PrepareDocumentUploadResponse = z.infer<
  typeof PrepareDocumentUploadResponseSchema
>;

export const AbortDocumentUploadResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.enum(["removed", "preserved", "not_found"]),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type AbortDocumentUploadResponse = z.infer<
  typeof AbortDocumentUploadResponseSchema
>;

export const DocumentVersionSchema = z.strictObject({
  id: UuidSchema,
  documentType: DocumentTypeSchema,
  label: z.string().min(1).max(100),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  fileSize: z.int().min(1).max(DOCUMENT_MAX_FILE_SIZE),
  contentHash: DocumentContentHashSchema,
  extractedText: z.string().max(DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH).nullable(),
  extractionStatus: DocumentExtractionStatusSchema,
  isDefault: z.boolean(),
  isPublished: z.boolean(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentVersionResponseSchema = z.strictObject({
  data: DocumentVersionSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type DocumentVersionResponse = z.infer<
  typeof DocumentVersionResponseSchema
>;

export const DocumentVersionListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(DocumentVersionSchema).max(100) }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type DocumentVersionListResponse = z.infer<
  typeof DocumentVersionListResponseSchema
>;

const UpdateDocumentMetadataRequestSchema = z
  .strictObject({
    action: z.literal("update_metadata"),
    label: DocumentLabelSchema.optional(),
    extractedText: z
      .string()
      .max(DOCUMENT_EXTRACTED_TEXT_MAX_LENGTH)
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.label !== undefined || value.extractedText !== undefined,
    "At least one metadata field is required",
  );

export const UpdateDocumentVersionRequestSchema = z.discriminatedUnion(
  "action",
  [
    UpdateDocumentMetadataRequestSchema,
    z.strictObject({ action: z.literal("set_default") }),
    z.strictObject({
      action: z.literal("set_archived"),
      archived: z.boolean(),
    }),
  ],
);

export type UpdateDocumentVersionRequest = z.infer<
  typeof UpdateDocumentVersionRequestSchema
>;

export const SetDocumentPublicationRequestSchema = z.strictObject({
  documentVersionId: UuidSchema,
});

export type SetDocumentPublicationRequest = z.infer<
  typeof SetDocumentPublicationRequestSchema
>;

export const PublicDocumentDispositionSchema = z.enum(["inline", "attachment"]);

export type PublicDocumentDisposition = z.infer<
  typeof PublicDocumentDispositionSchema
>;

export const CreateDocumentDownloadUrlRequestSchema = z.strictObject({
  disposition: PublicDocumentDispositionSchema,
});

export type CreateDocumentDownloadUrlRequest = z.infer<
  typeof CreateDocumentDownloadUrlRequestSchema
>;

export const DocumentDownloadUrlResponseSchema = z.strictObject({
  data: z.strictObject({
    url: z.url(),
    expiresAt: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type DocumentDownloadUrlResponse = z.infer<
  typeof DocumentDownloadUrlResponseSchema
>;

export const PublicDocumentAccessResponseSchema = z.strictObject({
  data: z.strictObject({
    documentType: DocumentTypeSchema,
    url: z.url(),
    expiresAt: Rfc3339TimestampSchema,
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type PublicDocumentAccessResponse = z.infer<
  typeof PublicDocumentAccessResponseSchema
>;
