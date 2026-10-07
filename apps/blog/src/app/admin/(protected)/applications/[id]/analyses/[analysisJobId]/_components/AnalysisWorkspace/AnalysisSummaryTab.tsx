import type { AnalysisWorkspace, MatchStatus } from "@workspace/contracts";

import { formatApplicationDate } from "#/libs/application-ui";

import { JOB_SECTION_LABELS, MATCH_LABELS } from "./AnalysisWorkspaceLabels";
import { InputAuditDetails } from "./AnalysisWorkspaceParts";

type AnalysisResult = NonNullable<AnalysisWorkspace["job"]["result"]>;

export function AnalysisSummaryTab({
  completedChecklist,
  liveReviewedScore,
  matchCounts,
  result,
  workspace,
}: Readonly<{
  completedChecklist: number;
  liveReviewedScore: number | null;
  matchCounts: Record<MatchStatus, number>;
  result: AnalysisResult;
  workspace: AnalysisWorkspace;
}>) {
  return (
    <>
      <section
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        id="summary"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="bg-muted/40 rounded-md p-4">
            <p className="text-muted-foreground text-xs">AI 적합도</p>
            <strong className="text-primary mt-1 block text-3xl">
              {result.fitScore}점
            </strong>
          </div>
          <div className="bg-muted/40 rounded-md p-4">
            <p className="text-muted-foreground text-xs">내 판정 점수</p>
            <strong className="mt-1 block text-3xl">
              {liveReviewedScore ?? result.fitScore}점
            </strong>
          </div>
          <div className="bg-muted/40 rounded-md p-4">
            <p className="text-muted-foreground text-xs">근거 확인율</p>
            <strong className="mt-1 block text-3xl">
              {workspace.evidenceCoverage === null
                ? "-"
                : `${workspace.evidenceCoverage}%`}
            </strong>
            <p className="text-muted-foreground mt-1 text-xs">
              개인 자료에서 확인된 요구사항 비율
            </p>
          </div>
          <div className="bg-muted/40 rounded-md p-4">
            <p className="text-muted-foreground text-xs">면접 답변</p>
            <strong className="mt-1 block text-3xl">
              {
                workspace.questions.filter((item) => item.currentAnswer?.answer)
                  .length
              }
              /{workspace.questions.length}
            </strong>
          </div>
          <div className="bg-muted/40 rounded-md p-4">
            <p className="text-muted-foreground text-xs">준비 진행률</p>
            <strong className="mt-1 block text-3xl">
              {completedChecklist}/{workspace.checklist.length}
            </strong>
          </div>
        </div>
        <section>
          <h3 className="mb-2 font-semibold">분석 핵심 결론</h3>
          <p className="leading-7 break-words whitespace-pre-wrap">
            {result.comparison.summary}
          </p>
        </section>
        <p className="text-muted-foreground text-xs">
          적합도는 채용 합격 확률이 아니라 공고 요구사항과 현재 자료의 일치
          정도입니다. unknown은 경험이 없다는 뜻이 아니라 현재 자료에서 근거를
          확인하지 못했다는 뜻입니다.
        </p>
        <section className="border-border rounded-md border p-5">
          <h3 className="font-semibold">지원 시 전달할 핵심 메시지</h3>
          <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-7">
            {result.comparison.applicationStrategy.keyMessages.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-4" aria-label="문서별 수정 제안">
          {(
            [
              [
                "이력서에 반영할 내용",
                result.comparison.applicationStrategy.resumeSuggestions,
                result.comparison.applicationStrategy.resumeFocus,
              ],
              [
                "포트폴리오에 반영할 내용",
                result.comparison.applicationStrategy.portfolioSuggestions,
                result.comparison.applicationStrategy.portfolioFocus,
              ],
            ] as const
          ).map(([title, suggestions, legacy]) => (
            <article
              className="border-border rounded-md border p-5"
              key={title}
            >
              <h3 className="font-semibold">{title}</h3>
              {suggestions?.length ? (
                <ol className="mt-4 grid list-decimal gap-4 pl-5">
                  {suggestions.map((item, index) => (
                    <li key={index} className="pl-1 text-sm leading-7">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                        {item.reason}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">
                        <span className="font-medium">수정 제안: </span>
                        {item.action}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm leading-7 whitespace-pre-wrap">
                  {legacy ?? "제안된 내용이 없습니다."}
                </p>
              )}
            </article>
          ))}
        </section>
        <details className="border-border rounded-md border p-5">
          <summary className="cursor-pointer font-semibold">
            지원동기 초안
          </summary>
          <p className="text-muted-foreground mt-3 text-sm leading-7 break-words whitespace-pre-wrap">
            {result.comparison.applicationStrategy.motivationDraft ??
              "지원동기 초안이 없습니다."}
          </p>
        </details>
        <ul className="flex flex-wrap gap-2 text-xs">
          {Object.entries(MATCH_LABELS).map(([status, label]) => (
            <li className="bg-muted rounded-full px-3 py-1" key={status}>
              {label} {matchCounts[status as MatchStatus]}개
            </li>
          ))}
        </ul>
        <dl className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">분석 완료 </dt>
            <dd className="inline">
              {formatApplicationDate(workspace.job.finishedAt)}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">스키마 </dt>
            <dd className="inline">
              {workspace.resultMetadata?.schemaVersion ?? "확인 불가"}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">이력서 </dt>
            <dd className="inline">{workspace.sources.resume.label}</dd>
          </div>
          <div>
            <dt className="inline font-medium">포트폴리오 </dt>
            <dd className="inline">{workspace.sources.portfolio.label}</dd>
          </div>
          <div>
            <dt className="inline font-medium">공고 스냅샷 </dt>
            <dd className="inline font-mono">
              {workspace.sources.jobPostingSnapshot.contentHash.slice(0, 12)}…
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">자료 해시 </dt>
            <dd className="inline font-mono">
              {workspace.sources.resume.contentHash.slice(0, 8)}… /{" "}
              {workspace.sources.portfolio.contentHash.slice(0, 8)}…
            </dd>
          </div>
        </dl>
        {workspace.resultMetadata?.usageSummary ? (
          <section
            aria-label="AI 분석 사용량"
            className="bg-muted/30 grid gap-3 rounded-md p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">AI 분석 사용량</h3>
              <span className="text-muted-foreground text-xs">
                실제 비용은 OpenAI Usage·Billing에서 확인하세요.
              </span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">입력</dt>
                <dd className="mt-1 font-semibold">
                  {workspace.resultMetadata.usageSummary.inputTokens.toLocaleString()}{" "}
                  tokens
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">출력</dt>
                <dd className="mt-1 font-semibold">
                  {workspace.resultMetadata.usageSummary.outputTokens.toLocaleString()}{" "}
                  tokens
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">합계</dt>
                <dd className="mt-1 font-semibold">
                  {workspace.resultMetadata.usageSummary.totalTokens.toLocaleString()}{" "}
                  tokens
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">처리 시간</dt>
                <dd className="mt-1 font-semibold">
                  {(
                    workspace.resultMetadata.usageSummary.totalLatencyMs / 1000
                  ).toFixed(1)}
                  초
                </dd>
              </div>
            </dl>
            <InputAuditDetails audit={workspace.resultMetadata.inputAudit} />
          </section>
        ) : null}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            모델·프롬프트 실행 정보
          </summary>
          <ul className="mt-3 grid gap-2 text-xs">
            {(workspace.resultMetadata?.executions ?? []).map((execution) => (
              <li
                className="border-border rounded-md border p-3"
                key={execution.step}
              >
                {execution.step} · {execution.model} · {execution.promptVersion}{" "}
                · 입력 {execution.inputTokens.toLocaleString()} / 출력{" "}
                {execution.outputTokens.toLocaleString()} tokens ·{" "}
                {execution.latencyMs.toLocaleString()}ms
              </li>
            ))}
          </ul>
        </details>
      </section>

      <details className="border-border bg-card rounded-lg border p-5">
        <summary className="cursor-pointer text-lg font-semibold">
          공고 원문과 AI 분류
        </summary>
        <section className="mt-4 grid gap-4">
          <p className="leading-7 break-words">{result.job.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(JOB_SECTION_LABELS).map(([key, label]) => {
              const content =
                result.job.bodySections[
                  key as keyof typeof result.job.bodySections
                ];
              return content ? (
                <article
                  className="border-border rounded-md border p-3"
                  key={key}
                >
                  <h4 className="font-medium">{label}</h4>
                  <p className="text-muted-foreground mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
                    {content}
                  </p>
                </article>
              ) : null;
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-medium">기술 스택</h4>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {result.job.technologies.map((technology) => (
                  <li
                    className="bg-primary/10 text-primary rounded-full px-3 py-1"
                    key={technology.name}
                  >
                    {technology.name}
                    {technology.category ? ` · ${technology.category}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">인재상</h4>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
                {result.job.traits.map((trait) => (
                  <li key={trait.text}>{trait.text}</li>
                ))}
              </ul>
            </div>
          </div>
          {[...result.job.warnings, ...result.comparison.warnings].length ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">확인 주의사항</p>
              <ul className="mt-1 list-disc pl-5">
                {[...result.job.warnings, ...result.comparison.warnings].map(
                  (warning) => (
                    <li key={warning}>{warning}</li>
                  ),
                )}
              </ul>
            </div>
          ) : null}
        </section>
      </details>
    </>
  );
}
