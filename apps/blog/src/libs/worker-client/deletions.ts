"use client";
import {
  DeletionOperationResponseSchema,
  DeletionPreviewResponseSchema,
} from "@workspace/contracts";

import { requestWorker } from "./core";
const path = (type: "application" | "document", id: string) =>
  `/v1/${type === "application" ? "applications" : "document-versions"}/${id}`;
export const previewDeletion = (type: "application" | "document", id: string) =>
  requestWorker(
    `${path(type, id)}/deletion-preview`,
    DeletionPreviewResponseSchema,
  );
export const deleteResource = (
  type: "application" | "document",
  id: string,
  fingerprint: string,
) =>
  requestWorker(
    path(type, id),
    DeletionOperationResponseSchema,
    { method: "DELETE", body: JSON.stringify({ fingerprint }) },
    true,
  );
export const getDeletionOperation = (id: string) =>
  requestWorker(
    `/v1/deletion-operations/${id}`,
    DeletionOperationResponseSchema,
  );
