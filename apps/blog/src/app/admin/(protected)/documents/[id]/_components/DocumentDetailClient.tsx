"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { DocumentVersion } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import {
  ArrowLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from "lucide-react";

import {
  createDocumentDownloadUrl,
  getDocumentVersion,
  publishDocumentVersion,
  unpublishDocumentVersion,
  updateDocumentVersion,
  WorkerApiError,
} from "#/libs/worker-client";

const fieldClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2";

function getErrorMessage(error: unknown): string {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function DocumentDetailClient({
  documentVersionId,
}: Readonly<{ documentVersionId: string }>) {
  const [document, setDocument] = useState<DocumentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDocumentVersion(documentVersionId);
      setDocument(response.data);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> 문서를 불러오는
        중입니다.
      </div>
    );
  }

  if (!document) {
    return (
      <section className="flex flex-col gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href="/admin/documents">
            <ArrowLeftIcon /> 목록으로
          </Link>
        </Button>
        <p className="text-destructive text-sm" role="alert">
          {error ?? "문서를 찾을 수 없습니다."}
        </p>
      </section>
    );
  }

  const disabled = pending !== null;
  const documentTypeLabel =
    document.documentType === "resume" ? "이력서" : "포트폴리오";

  return (
    <section className="flex flex-col gap-6">
      <Button asChild className="w-fit" variant="ghost">
        <Link href="/admin/documents">
          <ArrowLeftIcon /> 문서 목록
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold">
            {documentTypeLabel}
          </p>
          <h2 className="mt-1 text-2xl font-bold">{document.label}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {document.originalFilename}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {document.isDefault ? (
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs">
              기본 버전
            </span>
          ) : null}
          {document.isPublished ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
              공개 중
            </span>
          ) : null}
          {document.archivedAt ? (
            <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs">
              보관됨
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="border-border bg-card flex flex-wrap gap-2 rounded-lg border p-5">
        <Button
          disabled={disabled}
          onClick={() => void openDocument("inline")}
          variant="outline"
        >
          <ExternalLinkIcon /> PDF 미리보기
        </Button>
        <Button
          disabled={disabled}
          onClick={() => void openDocument("attachment")}
          variant="outline"
        >
          <DownloadIcon /> 다운로드
        </Button>
        {!document.isDefault && !document.archivedAt ? (
          <Button
            disabled={disabled}
            onClick={() =>
              void runAction(
                "default",
                async () =>
                  (
                    await updateDocumentVersion(document.id, {
                      action: "set_default",
                    })
                  ).data,
              )
            }
          >
            기본 버전으로 지정
          </Button>
        ) : null}
        {!document.archivedAt ? (
          document.isPublished ? (
            <Button
              disabled={disabled}
              onClick={() =>
                void runAction("unpublish", () =>
                  unpublishDocumentVersion(document.documentType),
                )
              }
              variant="outline"
            >
              공개 해제
            </Button>
          ) : (
            <Button
              disabled={disabled}
              onClick={() =>
                void runAction(
                  "publish",
                  async () =>
                    (
                      await publishDocumentVersion(document.documentType, {
                        documentVersionId: document.id,
                      })
                    ).data,
                )
              }
              variant="outline"
            >
              공개 버전으로 지정
            </Button>
          )
        ) : null}
        <Button
          disabled={disabled}
          onClick={() =>
            void runAction(
              "archive",
              async () =>
                (
                  await updateDocumentVersion(document.id, {
                    action: "set_archived",
                    archived: !document.archivedAt,
                  })
                ).data,
            )
          }
          variant="outline"
        >
          {document.archivedAt ? "보관 해제" : "보관"}
        </Button>
      </div>

      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        onSubmit={handleMetadata}
      >
        <div>
          <h3 className="font-semibold">분석용 문서 정보</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            자동 텍스트 추출 전까지 분석에 사용할 내용을 직접 관리합니다.
          </p>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          버전 이름
          <input
            className={fieldClassName}
            defaultValue={document.label}
            maxLength={100}
            name="label"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          추출 텍스트
          <textarea
            className={`${fieldClassName} min-h-80 resize-y leading-6`}
            defaultValue={document.extractedText ?? ""}
            maxLength={500_000}
            name="extractedText"
            placeholder="PDF에서 복사한 이력서 또는 포트폴리오 내용을 입력하세요."
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            상태: {document.extractionStatus}
          </p>
          <Button disabled={disabled} type="submit">
            {pending === "metadata" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : null}
            저장
          </Button>
        </div>
      </form>
    </section>
  );
}
