import type { ApplicationStatus } from "@workspace/contracts";

import {
  APPLICATION_STATUS_COLORS,
  getApplicationStatusLabel,
} from "#/libs/application-ui";

export function ApplicationStatusBadge({
  status,
}: Readonly<{ status: ApplicationStatus }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${APPLICATION_STATUS_COLORS[status]}`}
    >
      {getApplicationStatusLabel(status)}
    </span>
  );
}
