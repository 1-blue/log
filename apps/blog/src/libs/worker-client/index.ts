"use client";

import {
  type AdminSessionResponse,
  AdminSessionResponseSchema,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export * from "./ai-usage";
export * from "./analysis";
export * from "./applications";
export * from "./collections";
export * from "./core";
export * from "./deletions";
export * from "./documents";
export * from "./interview";
export * from "./notifications";

export function getWorkerAdminSession(): Promise<AdminSessionResponse> {
  return requestWorker("/v1/auth/me", AdminSessionResponseSchema);
}
