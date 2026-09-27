"use client";

import {
  type ApplicationJobPostingResponse,
  ApplicationJobPostingResponseSchema,
  type ApplicationListQuery,
  type ApplicationListResponse,
  ApplicationListResponseSchema,
  type ApplicationResponse,
  ApplicationResponseSchema,
  type ApplicationStateInput,
  type CreateApplicationRequest,
  type PatchApplicationRequest,
  type PatchJobPostingRequest,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export function createApplication(
  input: CreateApplicationRequest,
): Promise<ApplicationResponse> {
  return requestWorker(
    "/v1/applications",
    ApplicationResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function createApplicationAttempt(
  jobPostingId: string,
  input: ApplicationStateInput,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}/applications`,
    ApplicationResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function listApplications(
  filters: Partial<ApplicationListQuery> = {},
): Promise<ApplicationListResponse> {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.archived) query.set("archived", filters.archived);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.page) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestWorker(
    `/v1/applications${suffix}`,
    ApplicationListResponseSchema,
  );
}

export function getApplication(
  applicationId: string,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}`,
    ApplicationResponseSchema,
  );
}

export function updateApplication(
  applicationId: string,
  input: PatchApplicationRequest,
): Promise<ApplicationResponse> {
  return requestWorker(
    `/v1/applications/${applicationId}`,
    ApplicationResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function updateJobPosting(
  jobPostingId: string,
  input: PatchJobPostingRequest,
): Promise<ApplicationJobPostingResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}`,
    ApplicationJobPostingResponseSchema,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}
