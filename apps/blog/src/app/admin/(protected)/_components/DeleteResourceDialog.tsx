"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

import type { DeletionOperation, DeletionPreview } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/Dialog";
import { Input } from "@workspace/ui/components/Input";

import {
  deleteResource,
  getDeletionOperation,
  previewDeletion,
  WorkerApiError,
} from "#/libs/worker-client";

const labels: Record<string, string> = {
  applications: "지원 이력",
  application_documents: "제출 문서 연결",
  application_status_history: "상태 변경 기록",
  analysis_jobs: "분석 실행",
  analysis_results: "분석 결과",
  analysis_reviews: "분석 검토",
  analysis_requirement_reviews: "요구사항 검토",
  analysis_step_executions: "분석 단계 기록",
  analysis_job_events: "분석 이벤트",
  interview_questions: "면접 질문",
  interview_answers: "면접 답변",
  interview_notes: "면접 메모",
  interview_checklist_items: "면접 체크리스트",
  document_versions: "문서·PDF",
  document_analysis_profiles: "문서 분석 프로필",
  document_evidence_reviews: "문서 근거 검토",
  document_publications: "공개 설정",
  slack_notifications: "알림 DB 기록",
  slack_job_threads: "알림 연결",
  api_idempotency_records: "요청 기록",
};
const message = (error: unknown) =>
  error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다. 다시 확인해 주세요.";
export function DeleteResourceDialog({
  targetType,
  targetId,
  disabled = false,
}: Readonly<{
  targetType: "application" | "document";
  targetId: string;
  disabled?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [operation, setOperation] = useState<DeletionOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const list =
    targetType === "application" ? "/admin/applications" : "/admin/documents";
  useEffect(() => {
    if (!open || operation) return;
    let alive = true;
    setPending(true);
    setError(null);
    setPreview(null);
    setConfirmation("");
    void previewDeletion(targetType, targetId)
      .then((result) => {
        if (alive) setPreview(result.data);
      })
      .catch((caught) => {
        if (alive) setError(message(caught));
      })
      .finally(() => {
        if (alive) setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [open, targetType, targetId, operation, previewRevision]);
  const operationId = operation?.id;
  const operationStatus = operation?.status;
  useEffect(() => {
    if (!open || !operationId || operationStatus === "completed") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const start = Date.now();
    const poll = async () => {
      try {
        const response = await getDeletionOperation(operationId);
        if (!alive) return;
        setOperation(response.data);
        if (response.data.status === "completed") return;
      } catch (caught) {
        if (alive) setError(message(caught));
      }
      if (alive && Date.now() - start < 15 * 60 * 1000)
        timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, operationId, operationStatus]);
  const remove = async () => {
    if (!preview?.allowed || confirmation !== "삭제") return;
    setPending(true);
    setError(null);
    try {
      setOperation(
        (await deleteResource(targetType, targetId, preview.fingerprint)).data,
      );
    } catch (caught) {
      setError(message(caught));
      setPreview(null);
      setConfirmation("");
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant="destructive">
          영구 삭제
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            보관된 {targetType === "document" ? "문서" : "지원 이력"} 영구 삭제
          </DialogTitle>
          <DialogDescription>
            삭제하면 앱에서 복원할 수 없습니다. 연결된 기록과 유지되는 항목을
            확인하세요.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {operation ? (
          <div className="grid gap-3 text-sm" role="status">
            <p>
              {operation.status === "completed"
                ? "영구 삭제가 완료되었습니다."
                : operation.status === "failed"
                  ? "기록은 삭제됐지만 PDF 정리가 실패했습니다. 서버가 자동으로 재시도합니다."
                  : "기록은 삭제됐으며 PDF 정리 중입니다. 아직 완전 삭제가 끝나지 않았습니다."}
            </p>
            <p className="text-muted-foreground break-all">
              작업 ID: {operation.id}
            </p>
            <Button
              onClick={() =>
                void getDeletionOperation(operation.id)
                  .then((result) => setOperation(result.data))
                  .catch((caught) => setError(message(caught)))
              }
              variant="outline"
            >
              정리 상태 확인
            </Button>
          </div>
        ) : preview ? (
          <div className="grid gap-4 text-sm">
            {preview.blockers.length > 0 && (
              <div role="alert">
                <p className="text-destructive font-medium">
                  지금은 삭제할 수 없습니다.
                </p>
                <ul className="mt-2 list-inside list-disc">
                  {preview.blockers.map((item) => (
                    <li key={item.id}>
                      {item.reason === "active_application" ? (
                        <Link
                          className="underline"
                          href={`/admin/applications/${item.id}`}
                        >
                          {item.label}: 먼저 보관해 주세요.
                        </Link>
                      ) : (
                        `${item.label}: ${item.reason === "not_archived" ? "먼저 보관해 주세요." : "실행 중인 작업이 끝난 뒤 다시 시도하세요."}`
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="font-medium">삭제되는 항목</p>
              <ul className="mt-2 list-inside list-disc">
                {Object.entries(preview.counts)
                  .filter(([, count]) => count > 0)
                  .map(([name, count]) => (
                    <li key={name}>
                      {labels[name] ?? name}: {count}개
                    </li>
                  ))}
              </ul>
            </div>
            {targetType === "document" && preview.applications.length > 0 && (
              <div>
                <p className="font-medium">함께 삭제되는 지원</p>
                <ul className="mt-2 list-inside list-disc">
                  {preview.applications.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </div>
            )}
            <p>유지: {preview.preserves.join(", ")}</p>
            {preview.allowed && (
              <label className="grid gap-2">
                확인을 위해 ‘삭제’를 입력하세요.
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
          </div>
        ) : pending ? (
          <p role="status">삭제 영향을 확인하는 중입니다.</p>
        ) : null}
        <DialogFooter>
          {operation ? (
            <Button asChild>
              <Link href={list}>목록으로</Link>
            </Button>
          ) : (
            <>
              {!preview && !pending && (
                <Button
                  variant="outline"
                  onClick={() => setPreviewRevision((value) => value + 1)}
                >
                  삭제 영향 다시 확인
                </Button>
              )}
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                disabled={
                  pending || !preview?.allowed || confirmation !== "삭제"
                }
                onClick={() => void remove()}
              >
                영구 삭제
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
