"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import type { DocumentType, DocumentVersion } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import { FileTextIcon, LoaderCircleIcon, UploadCloudIcon } from "lucide-react";

import { uploadDocumentVersion } from "#/libs/document-upload";
import { listDocumentVersions, WorkerApiError } from "#/libs/worker-client";

const inputClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2";

function getErrorMessage(error: unknown): string {
  if (error instanceof WorkerApiError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "업로드를 취소했습니다.";
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MiB`;
}

function typeLabel(type: DocumentType): string {
  return type === "resume" ? "이력서" : "포트폴리오";
}

export default function DocumentsClient() {
  const [items, setItems] = useState<DocumentVersion[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType | "all">("all");
  const [archived, setArchived] = useState<"exclude" | "only">("exclude");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

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
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      abortRef.current = null;
      setUploading(false);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold">문서 관리</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          공고별로 사용할 이력서와 포트폴리오 PDF를 버전별로 보관합니다.
        </p>
      </div>

      <form
        className="border-border bg-card grid gap-4 rounded-lg border p-5 md:grid-cols-[160px_1fr_1fr_auto] md:items-end"
        onSubmit={handleUpload}
      >
        <label className="grid gap-2 text-sm font-medium">
          문서 종류
          <select
            className={inputClassName}
            defaultValue="resume"
            name="documentType"
          >
            <option value="resume">이력서</option>
            <option value="portfolio">포트폴리오</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          버전 이름
          <input
            className={inputClassName}
            maxLength={100}
            name="label"
            placeholder="예: 2026 상반기 인프라 직군"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          PDF 파일
          <input
            accept="application/pdf,.pdf"
            className={`${inputClassName} file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm`}
            name="file"
            required
            type="file"
          />
        </label>
        <div className="flex gap-2">
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
