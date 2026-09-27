import type { Dispatch, FormEvent, SetStateAction } from "react";

import type {
  AnalysisWorkspace,
  InterviewAnswerRevision,
  InterviewChecklistItem,
  InterviewNote,
  Priority,
} from "@workspace/contracts";

import { AnalysisChecklistSection } from "./AnalysisChecklistSection";
import { AnalysisGapsSection } from "./AnalysisGapsSection";
import { AnalysisHistorySection } from "./AnalysisHistorySection";
import {
  AnalysisNotesSection,
  type InterviewNoteInput,
} from "./AnalysisNotesSection";
import { AnalysisQuestionsSection } from "./AnalysisQuestionsSection";

type AnalysisResult = NonNullable<AnalysisWorkspace["job"]["result"]>;

export function AnalysisInterviewTab({
  answerDrafts,
  answerHistory,
  completedChecklist,
  createChecklist,
  disabled,
  moveChecklist,
  onCompare,
  patchChecklist,
  removeChecklist,
  removeNote,
  result,
  saveAnswer,
  saveNote,
  setAnswerDrafts,
  showAnswerHistory,
  showInterviewReview,
  sortedGaps,
  workspace,
}: Readonly<{
  answerDrafts: Record<string, string>;
  answerHistory: Record<string, InterviewAnswerRevision[]>;
  completedChecklist: number;
  createChecklist: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  disabled: boolean;
  moveChecklist: (index: number, direction: -1 | 1) => Promise<void>;
  onCompare: (analysisJobId?: string) => void;
  patchChecklist: (
    item: InterviewChecklistItem,
    patch: { completed?: boolean; content?: string; priority?: Priority },
  ) => Promise<void>;
  removeChecklist: (item: InterviewChecklistItem) => Promise<void>;
  removeNote: (note: InterviewNote) => Promise<void>;
  result: AnalysisResult;
  saveAnswer: (questionId: string, clear?: boolean) => Promise<void>;
  saveNote: (
    input: InterviewNoteInput,
    current?: InterviewNote,
  ) => Promise<void>;
  setAnswerDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  showAnswerHistory: (questionId: string) => Promise<void>;
  showInterviewReview: boolean;
  sortedGaps: AnalysisResult["comparison"]["gaps"];
  workspace: AnalysisWorkspace;
}>) {
  return (
    <>
      <AnalysisGapsSection gaps={sortedGaps} />
      <AnalysisQuestionsSection
        answerDrafts={answerDrafts}
        answerHistory={answerHistory}
        disabled={disabled}
        result={result}
        saveAnswer={saveAnswer}
        setAnswerDrafts={setAnswerDrafts}
        showAnswerHistory={showAnswerHistory}
        workspace={workspace}
      />
      <AnalysisChecklistSection
        completedChecklist={completedChecklist}
        createChecklist={createChecklist}
        disabled={disabled}
        moveChecklist={moveChecklist}
        patchChecklist={patchChecklist}
        removeChecklist={removeChecklist}
        workspace={workspace}
      />
      <AnalysisNotesSection
        disabled={disabled}
        removeNote={removeNote}
        saveNote={saveNote}
        showInterviewReview={showInterviewReview}
        workspace={workspace}
      />
      <AnalysisHistorySection
        disabled={disabled}
        onCompare={onCompare}
        result={result}
        workspace={workspace}
      />
    </>
  );
}
