"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DocumentType } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from "lucide-react";

import {
  getPublicDocumentAccess,
  PublicDocumentApiError,
} from "#/libs/public-document-client";

type ViewerState =
  | { status: "error"; message: string }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; url: string };

interface PublicDocumentViewerProps {
  documentType: DocumentType;
  title: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof PublicDocumentApiError) return error.message;
  return "문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function PublicDocumentViewer({
  documentType,
  title,
}: PublicDocumentViewerProps) {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [action, setAction] = useState<"download" | "open" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [canEmbedPdf, setCanEmbedPdf] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const loadDocument = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: "loading" });
    setActionError(null);

    try {
      const response = await getPublicDocumentAccess(
        documentType,
        "inline",
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setState({ status: "ready", url: response.data.url });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof PublicDocumentApiError && error.status === 404) {
        setState({ status: "missing" });
        return;
      }
      setState({ status: "error", message: getErrorMessage(error) });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [documentType]);

  useEffect(() => {
    void loadDocument();
    return () => requestRef.current?.abort();
  }, [loadDocument]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateCanEmbedPdf = () => setCanEmbedPdf(mediaQuery.matches);
    updateCanEmbedPdf();
    mediaQuery.addEventListener("change", updateCanEmbedPdf);
    return () => mediaQuery.removeEventListener("change", updateCanEmbedPdf);
  }, []);

  async function openInNewTab() {
    const newTab = window.open("about:blank", "_blank");
    if (newTab) newTab.opener = null;
    setAction("open");
    setActionError(null);

    try {
      const response = await getPublicDocumentAccess(documentType, "inline");
      if (newTab) {
        newTab.location.replace(response.data.url);
      } else {
        window.location.assign(response.data.url);
      }
    } catch (error) {
      newTab?.close();
      setActionError(getErrorMessage(error));
    } finally {
      setAction(null);
    }
  }

  async function downloadDocument() {
    setAction("download");
    setActionError(null);

    try {
      const response = await getPublicDocumentAccess(
        documentType,
        "attachment",
      );
      const link = document.createElement("a");
      link.href = response.data.url;
      link.download = "";
      link.referrerPolicy = "no-referrer";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setAction(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div
        aria-live="polite"
        className="border-border bg-card text-muted-foreground flex min-h-64 items-center justify-center gap-2 rounded-xl border text-sm"
      >
        <LoaderCircleIcon className="size-5 animate-spin" /> {title}를 불러오는
        중입니다.
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="border-border bg-card flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <FileTextIcon className="text-muted-foreground size-10" />
        <p className="mt-4 font-semibold">현재 공개된 {title}가 없습니다.</p>
        <p className="text-muted-foreground mt-2 text-sm">
          공개할 문서가 준비되면 이 페이지에서 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="border-destructive/30 bg-destructive/5 flex min-h-64 flex-col items-center justify-center rounded-xl border p-8 text-center"
        role="alert"
      >
        <p className="font-semibold">{state.message}</p>
        <Button className="mt-4" onClick={loadDocument} variant="outline">
          <RefreshCwIcon /> 다시 시도
        </Button>
      </div>
    );
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-xl border">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <p className="font-semibold">{title} PDF</p>
          <p className="text-muted-foreground mt-1 text-xs">
            보안을 위해 열거나 다운로드할 때마다 새 링크를 발급합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={action !== null}
            onClick={openInNewTab}
            size="sm"
            type="button"
            variant="outline"
          >
            {action === "open" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <ExternalLinkIcon />
            )}
            새 탭에서 열기
          </Button>
          <Button
            disabled={action !== null}
            onClick={downloadDocument}
            size="sm"
            type="button"
            variant="outline"
          >
            {action === "download" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <DownloadIcon />
            )}
            다운로드
          </Button>
          <Button
            aria-label={`${title} 새로고침`}
            disabled={action !== null}
            onClick={loadDocument}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCwIcon />
          </Button>
        </div>
      </div>

      {actionError ? (
        <p
          className="border-destructive/30 bg-destructive/5 text-destructive border-b px-4 py-3 text-sm"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="bg-muted/30 p-3 md:p-5">
        {canEmbedPdf ? (
          <iframe
            className="border-border h-[75vh] min-h-[720px] w-full rounded-md border bg-white"
            referrerPolicy="no-referrer"
            src={state.url}
            title={`박상은 ${title} PDF`}
          />
        ) : (
          <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center px-4 text-center text-sm">
            <FileTextIcon className="mb-4 size-10" />
            모바일에서는 위의 새 탭 열기 또는 다운로드 버튼으로 {title}를 확인해
            주세요.
          </div>
        )}
      </div>
    </section>
  );
}
