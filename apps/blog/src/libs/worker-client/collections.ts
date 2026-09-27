"use client";

import {
  type CreateJobPostingCollectionRequest,
  type JobPostingCollectionListResponse,
  JobPostingCollectionListResponseSchema,
  type JobPostingCollectionResponse,
  JobPostingCollectionResponseSchema,
} from "@workspace/contracts";

import { requestWorker } from "./core";

export function createJobPostingCollection(
  jobPostingId: string,
  input: CreateJobPostingCollectionRequest,
): Promise<JobPostingCollectionResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}/collections`,
    JobPostingCollectionResponseSchema,
    { body: JSON.stringify(input), method: "POST" },
    true,
  );
}

export function getJobPostingCollection(
  jobPostingId: string,
  collectionRunId: string,
): Promise<JobPostingCollectionResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}/collections/${collectionRunId}`,
    JobPostingCollectionResponseSchema,
  );
}

export function listJobPostingCollections(
  jobPostingId: string,
): Promise<JobPostingCollectionListResponse> {
  return requestWorker(
    `/v1/job-postings/${jobPostingId}/collections`,
    JobPostingCollectionListResponseSchema,
  );
}
