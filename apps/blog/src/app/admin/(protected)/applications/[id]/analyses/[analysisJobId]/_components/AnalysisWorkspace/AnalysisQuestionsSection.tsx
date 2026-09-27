import type { Dispatch, SetStateAction } from "react";

import type {
  AnalysisWorkspace,
  InterviewAnswerRevision,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Textarea } from "@workspace/ui/components/Textarea";

import { HistoryIcon, SaveIcon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import { PRIORITY_LABELS } from "./AnalysisWorkspaceLabels";
import { EvidenceList } from "./AnalysisWorkspaceParts";

type AnalysisResult = NonNullable<AnalysisWorkspace["job"]["result"]>;

export function AnalysisQuestionsSection({
  answerDrafts,
  answerHistory,
  disabled,
  result,
  saveAnswer,
  setAnswerDrafts,
  showAnswerHistory,
  workspace,
}: Readonly<{
  answerDrafts: Record<string, string>;
  answerHistory: Record<string, InterviewAnswerRevision[]>;
  disabled: boolean;
  result: AnalysisResult;
  saveAnswer: (questionId: string, clear?: boolean) => Promise<void>;
  setAnswerDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  showAnswerHistory: (questionId: string) => Promise<void>;
  workspace: AnalysisWorkspace;
}>) {
  return (
    <section
      className="border-border bg-card grid gap-4 rounded-lg border p-5"
      id="questions"
    >
      <h3 className="text-lg font-semibold">예상 면접 질문</h3>
      {workspace.questions.map((question) => (
        <details
          className="border-border rounded-md border p-4"
          key={question.id}
        >
          <summary className="cursor-pointer font-medium break-words">
            [{PRIORITY_LABELS[question.priority]}] {question.question}
          </summary>
          <div className="mt-4 grid gap-3">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">질문 의도:</strong>{" "}
              {question.intent}
            </p>
            <p className="text-muted-foreground text-xs">
              관련 요구사항:{" "}
              {question.requirementIds
                .map(
                  (id) =>
                    result.job.requirements.find((item) => item.id === id)
                      ?.text ?? id,
                )
                .join(" · ")}
            </p>
            {question.answerOutline ? (
              <div className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
                <p className="font-medium">답변 핵심 포인트</p>
                <p className="text-muted-foreground mt-1 leading-6 whitespace-pre-wrap">
                  {question.answerOutline}
                </p>
              </div>
            ) : null}
            {question.modelAnswer ? (
              <div className="border-border bg-muted/30 rounded-md border p-3 text-sm">
                <p className="font-medium">AI 답변 초안</p>
                <p className="text-muted-foreground mt-1 leading-6 whitespace-pre-wrap">
                  {question.modelAnswer}
                </p>
                {question.answerEvidence.length ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium">
                      답변에 사용한 내 자료
                    </p>
                    <EvidenceList evidence={question.answerEvidence} />
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    확인된 개인 자료 근거가 없어 직접 작성해야 합니다.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                확인된 경험을 바탕으로 한 답변 초안이 없습니다. 내 경험을 직접
                정리해 주세요.
              </p>
            )}
            <label className="grid gap-1 text-sm font-medium">
              내 답변
              <Textarea
                className="min-h-40 resize-y"
                maxLength={20_000}
                onChange={(event) =>
                  setAnswerDrafts((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
                placeholder="상황 → 역할 → 행동 → 결과 → 배운 점 순서로 정리해 보세요."
                value={answerDrafts[question.id] ?? ""}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={disabled || !answerDrafts[question.id]?.trim()}
                onClick={() => void saveAnswer(question.id)}
                size="sm"
                type="button"
              >
                <SaveIcon /> 답변 저장
              </Button>
              <Button
                disabled={disabled || question.answerRevisionCount === 0}
                onClick={() => void saveAnswer(question.id, true)}
                size="sm"
                type="button"
                variant="outline"
              >
                현재 답변 해제
              </Button>
              <Button
                disabled={disabled}
                onClick={() => void showAnswerHistory(question.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <HistoryIcon /> 수정 이력 {question.answerRevisionCount}
              </Button>
            </div>
            {answerHistory[question.id] ? (
              <ol className="bg-muted/30 grid gap-2 rounded-md p-3 text-xs">
                {answerHistory[question.id]!.length ? (
                  answerHistory[question.id]!.map((revision) => (
                    <li
                      className="border-border border-b pb-2 last:border-0"
                      key={revision.id}
                    >
                      <strong>revision {revision.revision}</strong> ·{" "}
                      {formatApplicationDate(revision.createdAt)}
                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                        {revision.answer ?? "답변 해제"}
                      </p>
                    </li>
                  ))
                ) : (
                  <li>저장된 답변 이력이 없습니다.</li>
                )}
              </ol>
            ) : null}
          </div>
        </details>
      ))}
    </section>
  );
}
