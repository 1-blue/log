"use client";

import {
  type AdminSessionResponse,
  AdminSessionResponseSchema,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export * from "./analysis";
export * from "./applications";
export * from "./collections";
export * from "./core";
export * from "./documents";
export * from "./interview";

export function getWorkerAdminSession(): Promise<AdminSessionResponse> {
  return requestWorker("/v1/auth/me", AdminSessionResponseSchema);
}
