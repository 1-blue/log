import type { AnalysisWorkspace, InterviewNote } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import { Trash2Icon } from "lucide-react";

import { formatApplicationDate } from "#/libs/application-ui";

import { InterviewNoteForm } from "./AnalysisWorkspaceParts";

export type InterviewNoteInput = {
  content: string | null;
  followUpActions: string | null;
  improvements: string | null;
  interviewedAt: string;
  questionsAsked: string | null;
  roundLabel: string;
  wentWell: string | null;
};

export function AnalysisNotesSection({
  disabled,
  removeNote,
  saveNote,
  showInterviewReview,
  workspace,
}: Readonly<{
  disabled: boolean;
  removeNote: (note: InterviewNote) => Promise<void>;
  saveNote: (
    input: InterviewNoteInput,
    current?: InterviewNote,
  ) => Promise<void>;
  showInterviewReview: boolean;
  workspace: AnalysisWorkspace;
}>) {
  if (!showInterviewReview) {
    return (
      <div className="border-border bg-muted/30 rounded-lg border p-5 text-sm">
        <h3 className="font-semibold">면접 회고</h3>
        <p className="text-muted-foreground mt-1">
          면접 일정이 등록되거나 지원 상태가 면접 단계가 되면 회고를 작성할 수
          있습니다.
        </p>
      </div>
    );
  }

  return (
    <section
      className="border-border bg-card grid gap-5 rounded-lg border p-5"
      id="notes"
    >
      <h3 className="text-lg font-semibold">면접 회고</h3>
      <InterviewNoteForm disabled={disabled} onSave={saveNote} />
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
  );
}
