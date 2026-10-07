"use client";
import {
  type AiBalanceBaseline,
  type AiUsageDashboard,
  AiUsageDashboardResponseSchema,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export async function getAiUsageDashboard(
  days = 30,
): Promise<AiUsageDashboard> {
  return (
    await requestWorker(
      `/v1/ai-usage?days=${days}`,
      AiUsageDashboardResponseSchema,
    )
  ).data;
}
export async function saveAiBalanceBaseline(
  input: AiBalanceBaseline,
): Promise<void> {
  const { fetchWorker, readWorkerError } = await import("./core");
  const response = await fetchWorker("/v1/ai-usage/balance", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readWorkerError(response);
}
