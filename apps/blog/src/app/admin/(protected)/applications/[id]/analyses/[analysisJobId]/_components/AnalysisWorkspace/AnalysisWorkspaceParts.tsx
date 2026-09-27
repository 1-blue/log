import type { AnalysisWorkspace, InterviewNote } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import { Textarea } from "@workspace/ui/components/Textarea";

import { SaveIcon } from "lucide-react";

import { toLocalDateTimeInput, toUtcTimestamp } from "#/libs/application-ui";

const SOURCE_LABELS = {
  job_posting: "채용공고",
  portfolio: "포트폴리오",
  resume: "이력서",
} as const;

export function PreviewBadge() {
  return (
    <p className="border-primary/30 bg-primary/5 text-primary rounded-md border p-3 text-sm">
      개발 전용 fixture입니다. 이 화면의 변경은 브라우저 메모리에만 반영됩니다.
    </p>
  );
}

export function InputAuditDetails({
  audit,
}: Readonly<{
  audit: NonNullable<AnalysisWorkspace["resultMetadata"]>["inputAudit"];
}>) {
  const items = [
    ["공고 본문", audit.jobPosting],
    ["이력서", audit.resume],
    ["포트폴리오", audit.portfolio],
  ] as const;

  return (
    <details className="border-border rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        AI 입력 전달 요약
      </summary>
      <div className="text-muted-foreground mt-3 grid gap-3 text-xs leading-5">
        <p>
          저장된 분석 입력을 현재{" "}
          <span className="font-mono">{audit.policyVersion}</span> 정책으로
          재구성한 요약입니다. 원문은 표시하지 않습니다.
        </p>
        <p>
          PDF {audit.includesPdf ? "포함" : "미포함"} · 프로필{" "}
          {audit.includesProfile ? "포함" : "미포함"} · 문서 최대{" "}
          {audit.documentTextMaxLength.toLocaleString()}자 · 공고 최대{" "}
          {audit.jobPostingTextMaxLength.toLocaleString()}자
        </p>
        <dl className="grid gap-2 sm:grid-cols-3">
          {items.map(([label, item]) => (
            <div className="border-border rounded-md border p-2" key={label}>
              <dt className="text-foreground font-medium">{label}</dt>
              <dd>
                원문 {item.originalLength.toLocaleString()}자 · 저장{" "}
                {item.storedLength.toLocaleString()}자
                <br />
                전달 {item.dispatchLength.toLocaleString()}자
                {item.storedTruncated || item.dispatchTruncated ? (
                  <>
                    <br />
                    <span className="text-warning">
                      {item.storedTruncated ? "저장 시 생략" : ""}
                      {item.storedTruncated && item.dispatchTruncated
                        ? " · "
                        : ""}
                      {item.dispatchTruncated ? "전달 시 생략" : ""}
                    </span>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

export function EvidenceList({
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
          <p className="text-muted-foreground mt-2 leading-5 break-words">
            <span className="text-foreground font-medium">문맥:</span>{" "}
            {item.context ?? "원문에서 주변 문맥을 찾지 못했습니다."}
          </p>
          <blockquote className="text-muted-foreground mt-1 leading-5 break-words">
            “{item.excerpt}”
          </blockquote>
        </li>
      ))}
    </ul>
  );
}

export function InterviewNoteForm({
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
        <Input
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
        <Input
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
          <Textarea
            className="min-h-24 resize-y"
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
