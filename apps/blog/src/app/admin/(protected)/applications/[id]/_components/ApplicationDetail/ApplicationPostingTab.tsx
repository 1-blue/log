import type { Dispatch, SetStateAction } from "react";

import type {
  JobPostingCollectionRun,
  JobPostingSnapshot,
} from "@workspace/contracts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/Accordion";
import { Button } from "@workspace/ui/components/Button";
import { Label } from "@workspace/ui/components/Label";
import { Textarea } from "@workspace/ui/components/Textarea";

import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import {
  COLLECTION_ERROR_LABELS,
  JOB_POSTING_SECTION_LABELS,
} from "./ApplicationDetailLabels";

export function ApplicationPostingTab({
  activeCollection,
  collect,
  collections,
  disabled,
  latestCollection,
  latestSnapshot,
  manualContent,
  metadataDiffers,
  pending,
  setManualContent,
}: Readonly<{
  activeCollection: JobPostingCollectionRun | undefined;
  collect: (content: string | null) => Promise<void>;
  collections: JobPostingCollectionRun[];
  disabled: boolean;
  latestCollection: JobPostingCollectionRun | null;
  latestSnapshot: JobPostingSnapshot | null;
  manualContent: string;
  metadataDiffers: boolean;
  pending: string | null;
  setManualContent: Dispatch<SetStateAction<string>>;
}>) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">채용공고 원문 수집</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            수집하거나 직접 입력한 원문을 AI가 공통 형식으로 구조화하고, 원문과
            구조화 결과를 버전으로 보관합니다.
          </p>
        </div>
        <Button
          disabled={disabled || Boolean(activeCollection)}
          onClick={() => void collect(null)}
          type="button"
          variant="outline"
        >
          {pending === "collect" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <RotateCcwIcon />
          )}
          {latestCollection ? "자동 수집 재시도" : "자동 수집"}
        </Button>
      </div>

      {latestCollection ? (
        <div className="border-border bg-muted/30 mt-4 rounded-md border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {latestCollection.status === "queued" ||
              latestCollection.status === "running"
                ? "공고를 수집하고 있습니다."
                : latestCollection.status === "succeeded"
                  ? "공고 원문 수집을 완료했습니다."
                  : COLLECTION_ERROR_LABELS[
                      latestCollection.errorCode ?? "INVALID_JOB_POSTING"
                    ]}
            </span>
            <time className="text-muted-foreground text-xs">
              {formatApplicationDate(latestCollection.updatedAt)}
            </time>
          </div>
          {latestCollection.retryable ? (
            <p className="text-muted-foreground mt-2 text-xs">
              일시적인 오류일 수 있으므로 잠시 후 다시 시도할 수 있습니다.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          아직 수집한 원문이 없습니다.
        </p>
      )}

      {latestSnapshot ? (
        <div className="mt-5 grid gap-4">
          {metadataDiffers ? (
            <div className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
              <p className="font-medium">
                입력 정보와 AI가 확인한 공고 정보가 다릅니다.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                추출 회사명:{" "}
                {latestSnapshot.sourceMetadata.companyName ?? "확인 불가"} ·
                추출 공고명:{" "}
                {latestSnapshot.sourceMetadata.title ?? "확인 불가"}
              </p>
            </div>
          ) : null}
          <dl className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">출처 </dt>
              <dd className="inline">
                {latestSnapshot.source === "ai"
                  ? "AI 구조화"
                  : latestSnapshot.source === "manual"
                    ? "직접 입력"
                    : latestSnapshot.source === "wanted_html"
                      ? "Wanted 본문 HTML"
                      : latestSnapshot.source === "wanted_ai"
                        ? "AI 보완 본문"
                        : "Wanted JSON-LD"}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">구조화 버전 </dt>
              <dd className="inline">{latestSnapshot.parserVersion}</dd>
            </div>
            <div>
              <dt className="inline font-medium">수집 시각 </dt>
              <dd className="inline">
                {formatApplicationDate(latestSnapshot.fetchedAt)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">해시 </dt>
              <dd className="inline font-mono">
                {latestSnapshot.contentHash.slice(0, 12)}…
              </dd>
            </div>
          </dl>
          <Accordion
            className="border-border rounded-md border px-4"
            type="multiple"
          >
            {Object.entries(JOB_POSTING_SECTION_LABELS).map(([key, label]) => {
              const content =
                latestSnapshot.sections[
                  key as keyof typeof latestSnapshot.sections
                ];
              return content ? (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger>{label}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground max-w-prose text-sm leading-6 break-words whitespace-pre-wrap">
                      {content}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ) : null;
            })}
          </Accordion>
          <details className="border-border rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              정규화된 전체 원문 보기
            </summary>
            <pre className="border-border bg-background mt-3 max-h-96 overflow-auto rounded-md border p-4 text-xs leading-6 whitespace-pre-wrap">
              {latestSnapshot.normalizedContent}
            </pre>
          </details>
        </div>
      ) : null}

      <details
        className="border-border mt-5 border-t pt-5"
        open={
          latestCollection?.status === "needs_input" ||
          latestCollection?.status === "failed"
        }
      >
        <summary className="cursor-pointer text-sm font-medium">
          원문 직접 입력
        </summary>
        <form
          className="mt-3 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void collect(manualContent.trim());
          }}
        >
          <div className="grid gap-2 text-sm font-medium">
            <Label htmlFor="manual-job-content">원문 직접 입력</Label>
            <Textarea
              className="min-h-44 resize-y"
              id="manual-job-content"
              maxLength={100_000}
              minLength={100}
              onChange={(event) => setManualContent(event.target.value)}
              placeholder="자동 수집이 불가능하면 채용공고 본문을 붙여 넣어 주세요."
              value={manualContent}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              {manualContent.trim().length.toLocaleString()} / 100,000자 · 최소
              100자
            </span>
            <Button
              disabled={
                disabled ||
                Boolean(activeCollection) ||
                manualContent.trim().length < 100
              }
              type="submit"
            >
              {pending === "manual-collect" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : null}
              수동 원문 저장
            </Button>
          </div>
        </form>
      </details>

      {collections.length > 1 ? (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">
            최근 수집 이력 {collections.length}건
          </summary>
          <ol className="mt-3 grid gap-2">
            {collections.map((item) => (
              <li
                className="border-border flex flex-wrap justify-between gap-2 border-b py-2 last:border-0"
                key={item.id}
              >
                <span>
                  {item.mode === "manual" ? "직접 입력" : "자동 수집"} ·{" "}
                  {item.status}
                </span>
                <time className="text-muted-foreground">
                  {formatApplicationDate(item.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
