import type { Dispatch, SetStateAction } from "react";

import type { AnalysisWorkspace, MatchStatus } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";
import { Textarea } from "@workspace/ui/components/Textarea";

import { LoaderCircleIcon, SaveIcon } from "lucide-react";

import { MATCH_LABELS } from "./AnalysisWorkspaceLabels";
import { EvidenceList } from "./AnalysisWorkspaceParts";
import type { ReviewDraft } from "./AnalysisWorkspaceTypes";

type AnalysisResult = NonNullable<AnalysisWorkspace["job"]["result"]>;

export function AnalysisRequirementsTab({
  disabled,
  matchById,
  overallNote,
  pending,
  result,
  reviews,
  saveReview,
  setOverallNote,
  setReviews,
}: Readonly<{
  disabled: boolean;
  matchById: Map<string, AnalysisResult["comparison"]["matches"][number]>;
  overallNote: string;
  pending: string | null;
  result: AnalysisResult;
  reviews: ReviewDraft;
  saveReview: () => Promise<void>;
  setOverallNote: Dispatch<SetStateAction<string>>;
  setReviews: Dispatch<SetStateAction<ReviewDraft>>;
}>) {
  return (
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
        <Textarea
          className="min-h-24 resize-y"
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
                  <p className="mb-2 text-xs font-medium">
                    공고에서 요구한 내용
                  </p>
                  <EvidenceList evidence={requirement.evidence} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium">
                    내 자료에서 찾은 경험
                  </p>
                  <EvidenceList evidence={match?.profileEvidence ?? []} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <label className="grid gap-1 text-sm font-medium">
                  내 판정
                  <Select
                    onValueChange={(value) =>
                      setReviews((current) => ({
                        ...current,
                        [requirement.id]: {
                          ...draft,
                          overrideStatus:
                            value === "ai" ? "" : (value as MatchStatus),
                        },
                      }))
                    }
                    value={draft.overrideStatus || "ai"}
                  >
                    <SelectTrigger aria-label="내 판정">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">AI 판단 유지</SelectItem>
                      {Object.entries(MATCH_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  내 메모
                  <Input
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
  );
}
