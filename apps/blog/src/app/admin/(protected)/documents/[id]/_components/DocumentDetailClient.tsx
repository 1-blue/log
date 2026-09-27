"use client";

import Link from "next/link";

import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import { Label } from "@workspace/ui/components/Label";
import { Textarea } from "@workspace/ui/components/Textarea";

import {
  ArrowLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from "lucide-react";

import {
  extractDocumentVersion,
  publishDocumentVersion,
  unpublishDocumentVersion,
  updateDocumentVersion,
} from "#/libs/worker-client";

import { useDocumentDetail } from "./useDocumentDetail";

export default function DocumentDetailClient({
  documentVersionId,
}: Readonly<{ documentVersionId: string }>) {
  const {
    document,
    error,
    handleMetadata,
    loading,
    openDocument,
    pending,
    runAction,
  } = useDocumentDetail(documentVersionId);

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
            업로드한 PDF에서 텍스트를 자동 추출해 분석에 사용합니다. 추출이
            어려운 PDF는 아래에서 직접 보정할 수 있습니다.
          </p>
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="document-detail-label">버전 이름</Label>
          <Input
            id="document-detail-label"
            defaultValue={document.label}
            maxLength={100}
            name="label"
            required
          />
        </div>
        <div className="grid gap-2 text-sm font-medium">
          <Label htmlFor="document-detail-text">추출 텍스트</Label>
          <Textarea
            className="min-h-80 resize-y leading-6"
            defaultValue={document.extractedText ?? ""}
            maxLength={500_000}
            name="extractedText"
            placeholder="자동 추출 결과를 확인하거나 필요한 경우 직접 보정하세요."
            id="document-detail-text"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            상태: {document.extractionStatus}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={disabled || document.extractionStatus === "processing"}
              onClick={() =>
                void runAction("extract", async () => {
                  const response = await extractDocumentVersion(document.id);
                  return response.data;
                })
              }
              type="button"
              variant="outline"
            >
              {pending === "extract" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : null}
              PDF 다시 추출
            </Button>
            <Button disabled={disabled} type="submit">
              {pending === "metadata" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : null}
              저장
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
