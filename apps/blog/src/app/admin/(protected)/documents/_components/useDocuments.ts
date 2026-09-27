"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { DocumentType, DocumentVersion } from "@workspace/contracts";

import { uploadDocumentVersion } from "#/libs/document-upload";
import { listDocumentVersions, WorkerApiError } from "#/libs/worker-client";

function getErrorMessage(error: unknown): string {
  if (error instanceof WorkerApiError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "업로드를 취소했습니다.";
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function useDocuments() {
  const [items, setItems] = useState<DocumentVersion[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType | "all">("all");
  const [archived, setArchived] = useState<"exclude" | "only">("exclude");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDocumentType, setUploadDocumentType] =
    useState<DocumentType>("resume");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listDocumentVersions({
        archived,
        ...(documentType === "all" ? {} : { documentType }),
      });
      setItems(response.data.items);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [archived, documentType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const type = formData.get("documentType");
    const label = String(formData.get("label") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) {
      setError("업로드할 PDF 파일을 선택해 주세요.");
      return;
    }
    if (type !== "resume" && type !== "portfolio") {
      setError("문서 종류를 선택해 주세요.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      await uploadDocumentVersion({
        documentType: type,
        file,
        label,
        onProgress: ({ percentage }) => setProgress(percentage),
        signal: controller.signal,
      });
      form.reset();
      setUploadDocumentType("resume");
      setSelectedFile(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      abortRef.current = null;
      setUploading(false);
    }
  }

  return {
    abortRef,
    archived,
    documentType,
    error,
    fileInputRef,
    handleUpload,
    items,
    loading,
    progress,
    selectedFile,
    setArchived,
    setDocumentType,
    setSelectedFile,
    setUploadDocumentType,
    uploadDocumentType,
    uploading,
  };
}
