"use client";

import Link from "next/link";

import type { DocumentType } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import { Label } from "@workspace/ui/components/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";

import { FileTextIcon, LoaderCircleIcon, UploadCloudIcon } from "lucide-react";

import { useDocuments } from "./useDocuments";

function formatBytes(bytes: number): string {
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MiB`;
}

function typeLabel(type: DocumentType): string {
  return type === "resume" ? "이력서" : "포트폴리오";
}

export default function DocumentsClient() {
  const {
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
  } = useDocuments();

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">문서 관리</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          공고별로 사용할 이력서와 포트폴리오 PDF를 버전별로 보관합니다.
        </p>
      </div>

      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        onSubmit={handleUpload}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <Label htmlFor="document-type">문서 종류</Label>
            <Select
              name="documentType"
              onValueChange={(value: string) =>
                setUploadDocumentType(value as DocumentType)
              }
              value={uploadDocumentType}
            >
              <SelectTrigger id="document-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resume">이력서</SelectItem>
                <SelectItem value="portfolio">포트폴리오</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="document-label">버전 이름</Label>
            <Input
              id="document-label"
              maxLength={100}
              name="label"
              placeholder="예: 2026 상반기 인프라 직군"
              required
            />
          </div>
        </div>

        <div className="border-border bg-background grid gap-3 rounded-md border border-dashed p-4">
          <div>
            <Label htmlFor="document-file">PDF 파일</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              최대 20MiB의 PDF를 선택할 수 있습니다. AI OCR은 30페이지 이하
              문서를 지원하며, 초과한 경우 텍스트를 직접 입력해야 합니다.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <UploadCloudIcon /> 파일 선택
            </Button>
            <Input
              ref={fileInputRef}
              accept="application/pdf,.pdf"
              className="sr-only"
              id="document-file"
              name="file"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
              aria-required="true"
              type="file"
            />
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {selectedFile
                ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}`
                : "선택된 파일이 없습니다."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={uploading} type="submit">
            {uploading ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <UploadCloudIcon />
            )}
            {uploading ? `${progress}%` : "업로드"}
          </Button>
          {uploading ? (
            <Button
              onClick={() => abortRef.current?.abort()}
              type="button"
              variant="outline"
            >
              취소
            </Button>
          ) : null}
        </div>
        {uploading ? (
          <div className="bg-muted col-span-full h-2 overflow-hidden rounded-full">
            <div
              aria-label={`업로드 진행률 ${progress}%`}
              className="bg-primary h-full transition-[width]"
              role="progressbar"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["all", "resume", "portfolio"] as const).map((type) => (
            <Button
              key={type}
              onClick={() => setDocumentType(type)}
              size="sm"
              type="button"
              variant={documentType === type ? "default" : "outline"}
            >
              {type === "all" ? "전체" : typeLabel(type)}
            </Button>
          ))}
        </div>
        <Button
          onClick={() =>
            setArchived((value) => (value === "exclude" ? "only" : "exclude"))
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          {archived === "exclude" ? "보관된 버전 보기" : "사용 중인 버전 보기"}
        </Button>
      </div>

      {error ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <LoaderCircleIcon className="size-4 animate-spin" /> 문서를 불러오는
          중입니다.
        </div>
      ) : items.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          표시할 문서 버전이 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <Link
              className="border-border bg-card hover:border-primary/50 rounded-lg border p-5 transition-colors"
              href={`/admin/documents/${item.id}`}
              key={item.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <FileTextIcon className="text-primary mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {item.originalFilename} · {formatBytes(item.fileSize)}
                    </p>
                  </div>
                </div>
                <span className="bg-muted shrink-0 rounded-full px-2.5 py-1 text-xs">
                  {typeLabel(item.documentType)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {item.isDefault ? (
                  <span className="text-primary">기본 버전</span>
                ) : null}
                {item.isPublished ? (
                  <span className="text-emerald-600">공개 중</span>
                ) : null}
                {item.archivedAt ? (
                  <span className="text-muted-foreground">보관됨</span>
                ) : null}
                <span className="text-muted-foreground ml-auto">
                  {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
