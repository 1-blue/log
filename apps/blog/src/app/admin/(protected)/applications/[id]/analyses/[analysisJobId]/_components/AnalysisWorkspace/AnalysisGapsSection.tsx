import type { AnalysisWorkspace } from "@workspace/contracts";

import { PRIORITY_LABELS } from "./AnalysisWorkspaceLabels";

type Gap = NonNullable<
  AnalysisWorkspace["job"]["result"]
>["comparison"]["gaps"][number];

export function AnalysisGapsSection({ gaps }: Readonly<{ gaps: Gap[] }>) {
  return (
    <section
      className="border-border bg-card grid gap-4 rounded-lg border p-5"
      id="gaps"
    >
      <h3 className="text-lg font-semibold">부족 역량과 준비 액션</h3>
      {gaps.map((gap) => (
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
  );
}
