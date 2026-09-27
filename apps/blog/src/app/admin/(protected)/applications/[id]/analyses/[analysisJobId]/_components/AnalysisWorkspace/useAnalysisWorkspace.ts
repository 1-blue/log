"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type AnalysisRequirementReview,
  type AnalysisWorkspace,
  calculateAnalysisFitScore,
  type InterviewAnswerRevision,
  type InterviewChecklistItem,
  type InterviewNote,
  type Priority,
} from "@workspace/contracts";

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

import type { ReviewDraft } from "./AnalysisWorkspaceTypes";

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

export function useAnalysisWorkspace({
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
  const [activeTab, setActiveTab] = useState("summary");

  const changeTab = useCallback((value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["summary", "requirements", "interview"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

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

  return {
    activeTab,
    answerDrafts,
    answerHistory,
    changeTab,
    createChecklist,
    effectiveMatches,
    error,
    liveReviewedScore,
    load,
    loading,
    moveChecklist,
    notice,
    overallNote,
    patchChecklist,
    pending,
    removeChecklist,
    removeNote,
    result,
    reviews,
    saveAnswer,
    saveNote,
    saveReview,
    setAnswerDrafts,
    setOverallNote,
    setReviews,
    setWorkspace,
    showAnswerHistory,
    workspace,
  };
}
