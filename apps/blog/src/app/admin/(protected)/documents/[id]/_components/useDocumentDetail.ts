"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { DocumentVersion } from "@workspace/contracts";

import {
  createDocumentDownloadUrl,
  getDocumentVersion,
  updateDocumentVersion,
  WorkerApiError,
} from "#/libs/worker-client";

function getErrorMessage(error: unknown): string {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function useDocumentDetail(documentVersionId: string) {
  const [document, setDocument] = useState<DocumentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractedTextDraft, setDraft] = useState("");
  const [textDirty, setTextDirty] = useState(false);
  const [awaitingExtraction, setAwaitingExtraction] = useState(false);
  const setExtractedTextDraft = (text: string) => {
    setTextDirty(true);
    setDraft(text);
  };

  useEffect(() => {
    if (!textDirty) setDraft(document?.extractedText ?? "");
  }, [document?.extractedText, textDirty]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDocumentVersion(documentVersionId);
      setDocument(response.data);
      setAwaitingExtraction(
        ["pending", "processing"].includes(response.data.extractionStatus),
      );
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!awaitingExtraction) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    const poll = async () => {
      try {
        const response = await getDocumentVersion(documentVersionId);
        if (!alive) return;
        setDocument(response.data);
        if (["ready", "failed"].includes(response.data.extractionStatus)) {
          setAwaitingExtraction(false);
          return;
        }
      } catch (caught) {
        if (alive) setError(getErrorMessage(caught));
      }
      if (alive && Date.now() - start < 15 * 60 * 1000)
        timer = setTimeout(() => void poll(), 3000);
      else if (alive) {
        setAwaitingExtraction(false);
        setError(
          "추출 상태 확인 시간이 초과되었습니다. 페이지를 새로고침해 확인해 주세요.",
        );
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [documentVersionId, awaitingExtraction]);

  async function runAction(
    name: string,
    action: () => Promise<DocumentVersion | void>,
  ) {
    setPending(name);
    setError(null);
    try {
      const updated = await action();
      if (updated) setDocument(updated);
      else await load();
      if (name === "extract") setAwaitingExtraction(true);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function handleMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await runAction("metadata", async () => {
      const response = await updateDocumentVersion(documentVersionId, {
        action: "update_metadata",
        extractedText:
          String(formData.get("extractedText") ?? "").trim() || null,
        label: String(formData.get("label") ?? "").trim(),
      });
      setTextDirty(false);
      setAwaitingExtraction(false);
      return response.data;
    });
  }

  async function openDocument(disposition: "attachment" | "inline") {
    const previewWindow =
      disposition === "inline" ? window.open("about:blank", "_blank") : null;
    if (previewWindow) previewWindow.opener = null;
    setPending(disposition);
    setError(null);
    try {
      const response = await createDocumentDownloadUrl(documentVersionId, {
        disposition,
      });
      if (previewWindow) previewWindow.location.href = response.data.url;
      else window.location.assign(response.data.url);
    } catch (caught) {
      previewWindow?.close();
      setError(getErrorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  return {
    document,
    extractedTextDraft,
    setExtractedTextDraft,
    error,
    handleMetadata,
    loading,
    openDocument,
    pending,
    runAction,
  };
}
