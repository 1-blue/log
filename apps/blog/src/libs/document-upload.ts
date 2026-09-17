"use client";

import {
  DOCUMENT_MAX_FILE_SIZE,
  type DocumentType,
  DocumentUploadMetadataSchema,
  type DocumentVersion,
} from "@workspace/contracts";

import { createClient } from "#/libs/supabase/client";
import {
  abortDocumentUpload,
  completeDocumentUpload,
  getSupabaseAccessToken,
  prepareDocumentUpload,
  WorkerApiError,
} from "#/libs/worker-client";

const DOCUMENT_BUCKET = "career-documents";
const TUS_CHUNK_SIZE = 6 * 1_024 * 1_024;

export type DocumentUploadProgress = {
  bytesUploaded: number;
  percentage: number;
  totalBytes: number;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function getContentHash(file: File): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
}

async function uploadWithTus(
  file: File,
  endpoint: string,
  storagePath: string,
  onProgress: (progress: DocumentUploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { Upload } = await import("tus-js-client");
  const accessToken = await getSupabaseAccessToken();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback();
    };

    const upload = new Upload(file, {
      chunkSize: TUS_CHUNK_SIZE,
      endpoint,
      headers: { authorization: `Bearer ${accessToken}` },
      metadata: {
        bucketName: DOCUMENT_BUCKET,
        cacheControl: "3600",
        contentType: "application/pdf",
        objectName: storagePath,
      },
      onError: (error) => settle(() => reject(error)),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress({
          bytesUploaded,
          percentage: Math.round((bytesUploaded / bytesTotal) * 100),
          totalBytes: bytesTotal,
        });
      },
      onSuccess: () => settle(resolve),
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1_000, 3_000, 5_000],
      storeFingerprintForResuming: false,
      uploadDataDuringCreation: true,
    });

    const abort = () => {
      void upload
        .abort(true)
        .catch(() => undefined)
        .finally(() =>
          settle(() =>
            reject(new DOMException("업로드가 취소되었습니다.", "AbortError")),
          ),
        );
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    upload.start();
  });
}

export async function uploadDocumentVersion({
  documentType,
  file,
  label,
  onProgress,
  signal,
}: {
  documentType: DocumentType;
  file: File;
  label: string;
  onProgress: (progress: DocumentUploadProgress) => void;
  signal?: AbortSignal;
}): Promise<DocumentVersion> {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("업로드가 취소되었습니다.", "AbortError");
    }
  };

  throwIfAborted();
  if (file.size > DOCUMENT_MAX_FILE_SIZE) {
    throw new WorkerApiError(
      "VALIDATION_ERROR",
      "PDF 파일은 20MiB 이하여야 합니다.",
      400,
      false,
    );
  }

  const metadata = DocumentUploadMetadataSchema.parse({
    contentHash: await getContentHash(file),
    documentType,
    fileSize: file.size,
    label,
    mimeType: file.type,
    originalFilename: file.name,
  });
  throwIfAborted();
  const prepared = await prepareDocumentUpload(metadata);
  throwIfAborted();

  try {
    if (prepared.data.uploadMethod === "standard") {
      const { error } = await createClient()
        .storage.from(DOCUMENT_BUCKET)
        .uploadToSignedUrl(
          prepared.data.storagePath,
          prepared.data.uploadToken,
          file,
          { contentType: "application/pdf" },
        );
      if (error) {
        throw new WorkerApiError(
          "UPSTREAM_UNAVAILABLE",
          "파일을 저장소에 업로드하지 못했습니다.",
          503,
          true,
        );
      }
      throwIfAborted();
      onProgress({
        bytesUploaded: file.size,
        percentage: 100,
        totalBytes: file.size,
      });
    } else {
      await uploadWithTus(
        file,
        prepared.data.resumableEndpoint,
        prepared.data.storagePath,
        onProgress,
        signal,
      );
    }

    const completed = await completeDocumentUpload(
      prepared.data.documentVersionId,
      { ...metadata, storagePath: prepared.data.storagePath },
    );
    return completed.data;
  } catch (error) {
    await abortDocumentUpload(prepared.data.documentVersionId, {
      documentType: metadata.documentType,
      storagePath: prepared.data.storagePath,
    }).catch(() => undefined);
    throw error;
  }
}
