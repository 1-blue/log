import type { FormEvent } from "react";

import type {
  AnalysisWorkspace,
  InterviewChecklistItem,
  Priority,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { PRIORITY_LABELS } from "./AnalysisWorkspaceLabels";

export function AnalysisChecklistSection({
  completedChecklist,
  createChecklist,
  disabled,
  moveChecklist,
  patchChecklist,
  removeChecklist,
  workspace,
}: Readonly<{
  completedChecklist: number;
  createChecklist: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  disabled: boolean;
  moveChecklist: (index: number, direction: -1 | 1) => Promise<void>;
  patchChecklist: (
    item: InterviewChecklistItem,
    patch: { completed?: boolean; content?: string; priority?: Priority },
  ) => Promise<void>;
  removeChecklist: (item: InterviewChecklistItem) => Promise<void>;
  workspace: AnalysisWorkspace;
}>) {
  return (
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
            <Input
              className={`min-w-56 flex-1 ${item.completedAt ? "line-through opacity-60" : ""}`}
              defaultValue={item.content}
              disabled={disabled}
              key={item.updatedAt}
              maxLength={2_000}
              onBlur={(event) => {
                const content = event.target.value.trim();
                if (content && content !== item.content) {
                  void patchChecklist(item, { content });
                }
              }}
            />
            <span className="text-muted-foreground text-xs">
              {PRIORITY_LABELS[item.priority]} ·{" "}
              {item.source === "gap_action" ? "AI 준비 액션" : "직접 추가"}
            </span>
            <Select
              aria-label="체크리스트 중요도"
              disabled={disabled}
              onValueChange={(value) =>
                void patchChecklist(item, { priority: value as Priority })
              }
              value={item.priority}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        onSubmit={(event) => void createChecklist(event)}
      >
        <Input
          disabled={disabled}
          maxLength={2_000}
          name="content"
          placeholder="직접 준비할 항목"
          required
        />
        <Select defaultValue="medium" disabled={disabled} name="priority">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                중요도 {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={disabled} type="submit">
          <PlusIcon /> 추가
        </Button>
      </form>
    </section>
  );
}
