"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

import {
  type AnalysisRequirementReview,
  type AnalysisWorkspace,
  calculateAnalysisFitScore,
  type InterviewAnswerRevision,
  type InterviewChecklistItem,
  type InterviewNote,
  type MatchStatus,
  type Priority,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import {
  formatApplicationDate,
  toLocalDateTimeInput,
  toUtcTimestamp,
} from "#/libs/application-ui";
import {
  archiveInterviewChecklistItem,
  archiveInterviewNote,
  createInterviewChecklistItem,
  createInterviewNote,
  getAnalysisWorkspace,
  listInterviewAnswerRevisions,
  patchInterviewChecklistItem,
  patchInterviewNote,
  reorderInterviewChecklist,
  saveInterviewAnswer,
  updateAnalysisReview,
  WorkerApiError,
} from "#/libs/worker-client";

const inputClassName =
  "border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

const MATCH_LABELS: Record<MatchStatus, string> = {
  matched: "충족",
  missing: "미충족",
  partial: "부분 충족",
  unknown: "확인 불가",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "높음",
  low: "낮음",
  medium: "보통",
};

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const SOURCE_LABELS = {
  job_posting: "채용공고",
  portfolio: "포트폴리오",
  resume: "이력서",
} as const;

type ReviewDraft = Record<
  string,
  { note: string; overrideStatus: MatchStatus | "" }
>;

function errorMessage(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "요청을 처리하지 못했습니다.";
}

function reviewDraft(workspace: AnalysisWorkspace): ReviewDraft {
  return Object.fromEntries(
    workspace.review.requirements.map((review) => [
      review.requirementId,
      {
        note: review.note ?? "",
        overrideStatus: review.overrideStatus ?? "",
      },
    ]),
  );
}

function updateItem<T extends { id: string }>(items: T[], next: T) {
  return items.map((item) => (item.id === next.id ? next : item));
}

function PreviewBadge() {
  return (
    <p className="border-primary/30 bg-primary/5 text-primary rounded-md border p-3 text-sm">
      개발 전용 fixture입니다. 이 화면의 변경은 브라우저 메모리에만 반영됩니다.
    </p>
  );
}

function EvidenceList({
  evidence,
}: Readonly<{
  evidence: NonNullable<
    AnalysisWorkspace["job"]["result"]
  >["job"]["requirements"][number]["evidence"];
}>) {
  if (evidence.length === 0) {
    return <p className="text-muted-foreground text-xs">확인된 근거 없음</p>;
  }
  return (
    <ul className="grid gap-2">
      {evidence.map((item, index) => (
        <li
          className="border-border bg-muted/30 rounded-md border p-3 text-xs"
          key={`${item.source}-${item.sourceVersionId}-${index}`}
        >
          <p className="font-medium">
            {SOURCE_LABELS[item.source]}
            {item.section ? ` · ${item.section}` : ""}
          </p>
          <blockquote className="text-muted-foreground mt-1 break-words">
            “{item.excerpt}”
          </blockquote>
        </li>
      ))}
    </ul>
  );
}

function InterviewNoteForm({
  disabled,
  initial,
  onSave,
}: Readonly<{
  disabled: boolean;
  initial?: InterviewNote;
  onSave: (input: {
    content: string | null;
    followUpActions: string | null;
    improvements: string | null;
    interviewedAt: string;
    questionsAsked: string | null;
    roundLabel: string;
    wentWell: string | null;
  }) => Promise<void>;
}>) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      key={initial?.updatedAt ?? "new"}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const nullable = (name: string) =>
          String(form.get(name) ?? "").trim() || null;
        const interviewedAt = toUtcTimestamp(
          String(form.get("interviewedAt") ?? ""),
        );
        if (!interviewedAt) return;
        void onSave({
          content: nullable("content"),
          followUpActions: nullable("followUpActions"),
          improvements: nullable("improvements"),
          interviewedAt,
          questionsAsked: nullable("questionsAsked"),
          roundLabel: String(form.get("roundLabel") ?? "").trim(),
          wentWell: nullable("wentWell"),
        });
      }}
    >
      <label className="grid gap-1 text-sm font-medium">
        면접 단계
        <input
          className={inputClassName}
          defaultValue={initial?.roundLabel ?? ""}
          disabled={disabled}
          maxLength={100}
          name="roundLabel"
          placeholder="예: 1차 실무 면접"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        면접 일시
        <input
          className={inputClassName}
          defaultValue={toLocalDateTimeInput(
            initial?.interviewedAt ?? new Date().toISOString(),
          )}
          disabled={disabled}
          name="interviewedAt"
          required
          type="datetime-local"
        />
      </label>
      {[
        ["questionsAsked", "받은 질문"],
        ["wentWell", "잘한 점"],
        ["improvements", "개선할 점"],
        ["followUpActions", "후속 행동"],
        ["content", "자유 메모"],
      ].map(([name, label]) => (
        <label
          className="grid gap-1 text-sm font-medium sm:col-span-2"
          key={name}
        >
          {label}
          <textarea
            className={`${inputClassName} min-h-24 resize-y`}
            defaultValue={
              initial?.[name as keyof InterviewNote]?.toString() ?? ""
            }
            disabled={disabled}
            maxLength={20_000}
            name={name}
          />
        </label>
      ))}
      <Button className="w-fit sm:col-span-2" disabled={disabled} type="submit">
        <SaveIcon /> {initial ? "회고 수정" : "회고 추가"}
      </Button>
    </form>
  );
}

export default function AnalysisWorkspaceClient({
  analysisJobId,
  applicationId,
  initialData,
  preview = false,
}: Readonly<{
  analysisJobId: string;
  applicationId: string;
  initialData?: AnalysisWorkspace;
  preview?: boolean;
}>) {
  const [workspace, setWorkspace] = useState<AnalysisWorkspace | null>(
    initialData ?? null,
  );
  const [loading, setLoading] = useState(!initialData);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overallNote, setOverallNote] = useState(
    initialData?.review.overallNote ?? "",
  );
  const [reviews, setReviews] = useState<ReviewDraft>(
    initialData ? reviewDraft(initialData) : {},
  );
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initialData?.questions ?? []).map((question) => [
        question.id,
        question.currentAnswer?.answer ?? "",
      ]),
    ),
  );
  const [answerHistory, setAnswerHistory] = useState<
    Record<string, InterviewAnswerRevision[]>
  >({});

  const applyWorkspace = useCallback((next: AnalysisWorkspace) => {
    setWorkspace(next);
    setOverallNote(next.review.overallNote ?? "");
    setReviews(reviewDraft(next));
    setAnswerDrafts(
      Object.fromEntries(
        next.questions.map((question) => [
          question.id,
          question.currentAnswer?.answer ?? "",
        ]),
      ),
    );
  }, []);

  const load = useCallback(
    async (compareTo?: string) => {
      if (preview || !analysisJobId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await getAnalysisWorkspace(analysisJobId, compareTo);
        if (response.data.application.id !== applicationId) {
          throw new Error("분석과 지원 정보가 일치하지 않습니다.");
        }
        applyWorkspace(response.data);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [analysisJobId, applicationId, applyWorkspace, preview],
  );

  useEffect(() => {
    if (!initialData) void load();
  }, [initialData, load]);

  const result = workspace?.job.result ?? null;
  const effectiveMatches = useMemo(() => {
    if (!result) return [];
    return result.comparison.matches.map((match) => {
      const override = reviews[match.requirementId]?.overrideStatus;
      return {
        ...match,
        status: override || match.status,
      };
    });
  }, [result, reviews]);
  const liveReviewedScore = result
    ? calculateAnalysisFitScore(result.job.requirements, effectiveMatches)
    : null;

  async function saveReview() {
    if (!workspace || !result) return;
    setPending("review");
    setError(null);
    setNotice(null);
    const requirementReviews: AnalysisRequirementReview[] = Object.entries(
      reviews,
    )
      .map(([requirementId, value]) => ({
        note: value.note.trim() || null,
        overrideStatus: value.overrideStatus || null,
        requirementId,
      }))
      .filter((item) => item.note !== null || item.overrideStatus !== null);
    try {
      if (preview) {
        const updatedAt = new Date().toISOString();
        setWorkspace({
          ...workspace,
          review: {
            overallNote: overallNote.trim() || null,
            requirements: requirementReviews,
            updatedAt,
          },
          reviewedFitScore: liveReviewedScore,
        });
      } else {
        const response = await updateAnalysisReview(analysisJobId, {
          expectedUpdatedAt: workspace.review.updatedAt,
          overallNote: overallNote.trim() || null,
          requirements: requirementReviews,
        });
        setWorkspace({
          ...workspace,
          review: response.data.review,
          reviewedFitScore: response.data.reviewedFitScore,
        });
      }
      setNotice("내 판정과 메모를 저장했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function saveAnswer(questionId: string, clear = false) {
    if (!workspace) return;
    setPending(`answer:${questionId}`);
    setError(null);
    setNotice(null);
    try {
      if (preview) {
        const question = workspace.questions.find(
          (item) => item.id === questionId,
        )!;
        const answer = clear ? null : answerDrafts[questionId]?.trim() || null;
        const revision: InterviewAnswerRevision = {
          answer,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          questionId,
          revision: question.answerRevisionCount + 1,
        };
        setWorkspace({
          ...workspace,
          questions: updateItem(workspace.questions, {
            ...question,
            answerRevisionCount: revision.revision,
            currentAnswer: revision,
          }),
        });
        setAnswerHistory((current) => ({
          ...current,
          [questionId]: [revision, ...(current[questionId] ?? [])],
        }));
        if (clear) {
          setAnswerDrafts((current) => ({ ...current, [questionId]: "" }));
        }
      } else {
        const response = await saveInterviewAnswer(questionId, {
          answer: clear ? null : answerDrafts[questionId]?.trim() || null,
        });
        const question = workspace.questions.find(
          (item) => item.id === questionId,
        )!;
        setWorkspace({
          ...workspace,
          questions: updateItem(workspace.questions, {
            ...question,
            answerRevisionCount: response.data.revisionCount,
            currentAnswer: response.data.currentAnswer,
          }),
        });
        if (clear) {
          setAnswerDrafts((current) => ({ ...current, [questionId]: "" }));
        }
      }
      setNotice(clear ? "현재 답변을 해제했습니다." : "답변을 저장했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function showAnswerHistory(questionId: string) {
    if (answerHistory[questionId]) return;
    setPending(`history:${questionId}`);
    try {
      if (preview) {
        const current = workspace?.questions.find(
          (item) => item.id === questionId,
        )?.currentAnswer;
        setAnswerHistory((value) => ({
          ...value,
          [questionId]: current ? [current] : [],
        }));
      } else {
        const response = await listInterviewAnswerRevisions(questionId);
        setAnswerHistory((value) => ({
          ...value,
          [questionId]: response.data.items,
        }));
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function createChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") ?? "").trim();
    const priority = String(form.get("priority")) as Priority;
    setPending("checklist-create");
    try {
      const next = preview
        ? {
            analysisJobId,
            archivedAt: null,
            completedAt: null,
            content,
            createdAt: new Date().toISOString(),
            id: crypto.randomUUID(),
            position: workspace.checklist.length,
            priority,
            source: "custom" as const,
            sourceKey: null,
            updatedAt: new Date().toISOString(),
          }
        : (
            await createInterviewChecklistItem(analysisJobId, {
              content,
              priority,
            })
          ).data;
      setWorkspace({ ...workspace, checklist: [...workspace.checklist, next] });
      event.currentTarget.reset();
      setNotice("체크리스트 항목을 추가했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function patchChecklist(
    item: InterviewChecklistItem,
    patch: { completed?: boolean; content?: string; priority?: Priority },
  ) {
    if (!workspace) return;
    setPending(`checklist:${item.id}`);
    try {
      const next = preview
        ? {
            ...item,
            completedAt:
              patch.completed === undefined
                ? item.completedAt
                : patch.completed
                  ? new Date().toISOString()
                  : null,
            content: patch.content ?? item.content,
            priority: patch.priority ?? item.priority,
            updatedAt: new Date().toISOString(),
          }
        : (
            await patchInterviewChecklistItem(item.id, {
              ...patch,
              expectedUpdatedAt: item.updatedAt,
            })
          ).data;
      setWorkspace({
        ...workspace,
        checklist: updateItem(workspace.checklist, next),
      });
      setNotice("체크리스트를 저장했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function removeChecklist(item: InterviewChecklistItem) {
    if (!workspace || !window.confirm("이 체크리스트 항목을 보관할까요?"))
      return;
    setPending(`checklist:${item.id}`);
    try {
      if (!preview) {
        await archiveInterviewChecklistItem(item.id, item.updatedAt);
      }
      setWorkspace({
        ...workspace,
        checklist: workspace.checklist.filter((value) => value.id !== item.id),
      });
      setNotice("체크리스트 항목을 보관했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function moveChecklist(index: number, direction: -1 | 1) {
    if (!workspace) return;
    const target = index + direction;
    if (target < 0 || target >= workspace.checklist.length) return;
    const ordered = [...workspace.checklist];
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    setPending("checklist-order");
    try {
      const items = preview
        ? ordered.map((item, position) => ({ ...item, position }))
        : (
            await reorderInterviewChecklist(
              analysisJobId,
              ordered.map((item) => item.id),
            )
          ).data.items;
      setWorkspace({ ...workspace, checklist: items });
      setNotice("체크리스트 순서를 변경했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function saveNote(
    input: Omit<Parameters<typeof createInterviewNote>[1], "analysisJobId">,
    current?: InterviewNote,
  ) {
    if (!workspace) return;
    setPending(`note:${current?.id ?? "new"}`);
    try {
      let next: InterviewNote;
      if (preview) {
        next = {
          ...input,
          analysisJobId,
          applicationId,
          archivedAt: null,
          createdAt: current?.createdAt ?? new Date().toISOString(),
          id: current?.id ?? crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        };
      } else if (current) {
        next = (
          await patchInterviewNote(current.id, {
            ...input,
            expectedUpdatedAt: current.updatedAt,
          })
        ).data;
      } else {
        next = (
          await createInterviewNote(applicationId, {
            ...input,
            analysisJobId,
          })
        ).data;
      }
      setWorkspace({
        ...workspace,
        interviewNotes: current
          ? updateItem(workspace.interviewNotes, next)
          : [next, ...workspace.interviewNotes],
      });
      setNotice(
        current ? "면접 회고를 수정했습니다." : "면접 회고를 추가했습니다.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function removeNote(note: InterviewNote) {
    if (!workspace || !window.confirm("이 면접 회고를 보관할까요?")) return;
    setPending(`note:${note.id}`);
    try {
      if (!preview) await archiveInterviewNote(note.id, note.updatedAt);
      setWorkspace({
        ...workspace,
        interviewNotes: workspace.interviewNotes.filter(
          (item) => item.id !== note.id,
        ),
      });
      setNotice("면접 회고를 보관했습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> 분석 작업 화면을
        불러오는 중입니다.
      </p>
    );
  }

  if (!workspace) {
    return (
      <section className="grid gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/admin/applications/${applicationId}`}>
            <ArrowLeftIcon /> 지원 상세
          </Link>
        </Button>
        <p className="text-destructive" role="alert">
          {error ?? "분석 작업 화면을 불러오지 못했습니다."}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="grid max-w-4xl gap-4">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/admin/applications/${applicationId}`}>
            <ArrowLeftIcon /> 지원 상세
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">분석 결과 준비 중</h2>
        <p className="text-muted-foreground">
          분석이 완료된 뒤 요구사항 검토와 면접 준비를 시작할 수 있습니다.
        </p>
      </section>
    );
  }

  const matchById = new Map(
    result.comparison.matches.map((match) => [match.requirementId, match]),
  );
  const completedChecklist = workspace.checklist.filter(
    (item) => item.completedAt,
  ).length;
  const matchCounts = effectiveMatches.reduce(
    (counts, match) => ({
      ...counts,
      [match.status]: counts[match.status] + 1,
    }),
    { matched: 0, missing: 0, partial: 0, unknown: 0 },
  );
  const sortedGaps = [...result.comparison.gaps].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
  const disabled = pending !== null;

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <Button asChild className="w-fit" variant="ghost">
        <Link href={`/admin/applications/${applicationId}`}>
          <ArrowLeftIcon /> 지원 상세
        </Link>
      </Button>

      {preview ? <PreviewBadge /> : null}
      <div aria-live="polite" className="grid gap-2">
        {error ? (
          <p
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="border-primary/20 bg-primary/5 rounded-md border p-3 text-sm">
            {notice}
          </p>
        ) : null}
      </div>

      <header className="grid gap-3">
        <p className="text-primary text-sm font-semibold">
          {workspace.application.companyName} ·{" "}
          {workspace.application.attemptNumber}차 지원
        </p>
        <h2 className="text-2xl font-bold">{workspace.application.title}</h2>
        <nav
          aria-label="분석 작업 섹션"
          className="flex flex-wrap gap-2 text-xs"
        >
          {[
            ["summary", "요약"],
            ["requirements", "요구사항"],
            ["gaps", "부족 역량"],
            ["questions", "면접 질문"],
            ["checklist", "체크리스트"],
            ["notes", "면접 회고"],
            ["history", "이전 분석"],
          ].map(([id, label]) => (
            <a
              className="bg-muted rounded-full px-3 py-1.5 hover:underline"
              href={`#${id}`}
              key={id}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        id="summary"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="leading-7 break-words">{result.comparison.summary}</p>
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

      <section className="border-border bg-card grid gap-4 rounded-lg border p-5">
        <h3 className="text-lg font-semibold">공고 분석</h3>
        <p className="leading-7 break-words">{result.job.summary}</p>
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

      <section
        className="border-border bg-card grid gap-4 rounded-lg border p-5"
        id="requirements"
      >
        <div>
          <h3 className="text-lg font-semibold">요구사항과 내 판정</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            AI 원본 판단은 바꾸지 않고 내 판정과 메모를 별도로 저장합니다.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          전체 메모
          <textarea
            className={`${inputClassName} min-h-24 resize-y`}
            maxLength={20_000}
            onChange={(event) => setOverallNote(event.target.value)}
            value={overallNote}
          />
        </label>
        <div className="grid gap-4">
          {result.job.requirements.map((requirement) => {
            const match = matchById.get(requirement.id);
            const draft = reviews[requirement.id] ?? {
              note: "",
              overrideStatus: "" as const,
            };
            return (
              <article
                className="border-border grid gap-3 rounded-md border p-4"
                key={requirement.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {requirement.kind === "required" ? "필수" : "우대"}
                    </span>
                    <h4 className="font-medium">{requirement.text}</h4>
                  </div>
                  <span className="bg-muted rounded-full px-3 py-1 text-xs">
                    AI {MATCH_LABELS[match?.status ?? "unknown"]}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {match?.rationale ?? "비교 설명이 없습니다."}
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium">공고 근거</p>
                    <EvidenceList evidence={requirement.evidence} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium">개인 자료 근거</p>
                    <EvidenceList evidence={match?.profileEvidence ?? []} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <label className="grid gap-1 text-sm font-medium">
                    내 판정
                    <select
                      className={inputClassName}
                      onChange={(event) =>
                        setReviews((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...draft,
                            overrideStatus: event.target.value as
                              | MatchStatus
                              | "",
                          },
                        }))
                      }
                      value={draft.overrideStatus}
                    >
                      <option value="">AI 판단 유지</option>
                      {Object.entries(MATCH_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    내 메모
                    <input
                      className={inputClassName}
                      maxLength={5_000}
                      onChange={(event) =>
                        setReviews((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...draft,
                            note: event.target.value,
                          },
                        }))
                      }
                      placeholder="면접에서 사용할 근거나 보완점을 기록하세요."
                      value={draft.note}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
        <Button
          className="w-fit"
          disabled={disabled}
          onClick={() => void saveReview()}
          type="button"
        >
          {pending === "review" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <SaveIcon />
          )}{" "}
          내 판정 저장
        </Button>
      </section>

      <section
        className="border-border bg-card grid gap-4 rounded-lg border p-5"
        id="gaps"
      >
        <h3 className="text-lg font-semibold">부족 역량과 준비 액션</h3>
        {sortedGaps.map((gap) => (
          <article
            className="border-border rounded-md border p-4"
            key={gap.title}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">{gap.title}</h4>
              <span className="bg-muted rounded-full px-3 py-1 text-xs">
                중요도 {PRIORITY_LABELS[gap.priority]}
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {gap.description}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {gap.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section
        className="border-border bg-card grid gap-4 rounded-lg border p-5"
        id="questions"
      >
        <h3 className="text-lg font-semibold">예상 면접 질문</h3>
        {workspace.questions.map((question) => (
          <details
            className="border-border rounded-md border p-4"
            key={question.id}
            open={question.sourceIndex === 0}
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
              <label className="grid gap-1 text-sm font-medium">
                내 답변
                <textarea
                  className={`${inputClassName} min-h-40 resize-y`}
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

      <section
        className="border-border bg-card grid gap-4 rounded-lg border p-5"
        id="checklist"
      >
        <div>
          <h3 className="text-lg font-semibold">면접 전 체크리스트</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {completedChecklist}/{workspace.checklist.length}개 완료
          </p>
        </div>
        <ol className="grid gap-2">
          {workspace.checklist.map((item, index) => (
            <li
              className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
              key={item.id}
            >
              <button
                aria-label={item.completedAt ? "완료 취소" : "완료 처리"}
                className="text-primary"
                disabled={disabled}
                onClick={() =>
                  void patchChecklist(item, { completed: !item.completedAt })
                }
                type="button"
              >
                {item.completedAt ? <CheckCircle2Icon /> : <CircleIcon />}
              </button>
              <input
                className={`${inputClassName} min-w-56 flex-1 ${item.completedAt ? "line-through opacity-60" : ""}`}
                defaultValue={item.content}
                disabled={disabled}
                key={item.updatedAt}
                maxLength={2_000}
                onBlur={(event) => {
                  const content = event.target.value.trim();
                  if (content && content !== item.content)
                    void patchChecklist(item, { content });
                }}
              />
              <span className="text-muted-foreground text-xs">
                {PRIORITY_LABELS[item.priority]} ·{" "}
                {item.source === "gap_action" ? "AI 준비 액션" : "직접 추가"}
              </span>
              <select
                aria-label="체크리스트 중요도"
                className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                disabled={disabled}
                onChange={(event) =>
                  void patchChecklist(item, {
                    priority: event.target.value as Priority,
                  })
                }
                value={item.priority}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                aria-label="위로 이동"
                disabled={disabled || index === 0}
                onClick={() => void moveChecklist(index, -1)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                aria-label="아래로 이동"
                disabled={disabled || index === workspace.checklist.length - 1}
                onClick={() => void moveChecklist(index, 1)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                aria-label="항목 보관"
                disabled={disabled}
                onClick={() => void removeChecklist(item)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ol>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
          onSubmit={createChecklist}
        >
          <input
            className={inputClassName}
            disabled={disabled}
            maxLength={2_000}
            name="content"
            placeholder="직접 준비할 항목"
            required
          />
          <select
            className={inputClassName}
            defaultValue="medium"
            disabled={disabled}
            name="priority"
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                중요도 {label}
              </option>
            ))}
          </select>
          <Button disabled={disabled} type="submit">
            <PlusIcon /> 추가
          </Button>
        </form>
      </section>

      <section
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        id="notes"
      >
        <h3 className="text-lg font-semibold">면접 회고</h3>
        <InterviewNoteForm
          disabled={disabled}
          onSave={(input) => saveNote(input)}
        />
        <div className="grid gap-3">
          {workspace.interviewNotes.map((note) => (
            <details
              className="border-border rounded-md border p-4"
              key={note.id}
            >
              <summary className="cursor-pointer font-medium">
                {note.roundLabel} · {formatApplicationDate(note.interviewedAt)}
              </summary>
              <div className="mt-4 grid gap-3">
                <InterviewNoteForm
                  disabled={disabled}
                  initial={note}
                  onSave={(input) => saveNote(input, note)}
                />
                <Button
                  className="w-fit"
                  disabled={disabled}
                  onClick={() => void removeNote(note)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Trash2Icon /> 회고 보관
                </Button>
              </div>
            </details>
          ))}
          {workspace.interviewNotes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              아직 작성한 면접 회고가 없습니다.
            </p>
          ) : null}
        </div>
      </section>

      <section
        className="border-border bg-card grid gap-4 rounded-lg border p-5"
        id="history"
      >
        <div>
          <h3 className="text-lg font-semibold">이전 분석 비교</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            요구사항 ID가 달라질 수 있어 점수·건수·자료·실행 버전을 비교합니다.
          </p>
        </div>
        <label className="grid max-w-md gap-1 text-sm font-medium">
          비교할 분석
          <select
            className={inputClassName}
            disabled={disabled}
            onChange={(event) => {
              const id = event.target.value || undefined;
              if (preview) {
                setWorkspace({
                  ...workspace,
                  comparison:
                    workspace.history.find(
                      (item) => item.analysisJobId === id,
                    ) ?? null,
                });
              } else {
                void load(id);
              }
            }}
            value={workspace.comparison?.analysisJobId ?? ""}
          >
            <option value="">선택하지 않음</option>
            {workspace.history
              .filter((item) => item.analysisJobId !== workspace.job.id)
              .map((item) => (
                <option key={item.analysisJobId} value={item.analysisJobId}>
                  {formatApplicationDate(item.completedAt)} · {item.fitScore}점
                </option>
              ))}
          </select>
        </label>
        {workspace.comparison ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-muted/30 rounded-md p-4">
              <p className="text-xs font-medium">현재 분석</p>
              <strong className="mt-1 block text-2xl">
                {result.fitScore}점
              </strong>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                부족 역량 {result.comparison.gaps.length} · 질문{" "}
                {workspace.questions.length}
                <br />
                {workspace.sources.resume.label}
                <br />
                {workspace.sources.portfolio.label}
                <br />
                <span className="font-mono">
                  {workspace.sources.resume.contentHash.slice(0, 8)}… /{" "}
                  {workspace.sources.portfolio.contentHash.slice(0, 8)}…
                </span>
                <br />
                {workspace.resultMetadata?.executions
                  .map((item) => `${item.model} · ${item.promptVersion}`)
                  .join(" / ")}
              </p>
            </div>
            <div className="bg-muted/30 rounded-md p-4">
              <p className="text-xs font-medium">이전 분석</p>
              <strong className="mt-1 block text-2xl">
                {workspace.comparison.fitScore}점{" "}
                <span className="text-muted-foreground text-sm">
                  (
                  {result.fitScore - workspace.comparison.fitScore >= 0
                    ? "+"
                    : ""}
                  {result.fitScore - workspace.comparison.fitScore})
                </span>
              </strong>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                부족 역량 {workspace.comparison.gapCount} · 질문{" "}
                {workspace.comparison.questionCount}
                <br />
                {workspace.comparison.sources.resume.label}
                <br />
                {workspace.comparison.sources.portfolio.label}
                <br />
                <span className="font-mono">
                  {workspace.comparison.sources.resume.contentHash.slice(0, 8)}…
                  /{" "}
                  {workspace.comparison.sources.portfolio.contentHash.slice(
                    0,
                    8,
                  )}
                  …
                </span>
                <br />
                {workspace.comparison.executions
                  .map((item) => `${item.model} · ${item.promptVersion}`)
                  .join(" / ")}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            비교할 이전 분석을 선택해 주세요.
          </p>
        )}
      </section>
    </section>
  );
}
