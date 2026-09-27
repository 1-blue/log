import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";

import type { AnalysisJobService } from "./analysis-jobs.js";
import type { ApplicationService } from "./applications.js";
import type { JwtVerificationKey } from "./auth.js";
import type { DocumentService } from "./documents.js";
import type { IdempotencyService } from "./idempotency.js";
import type { InterviewWorkspaceService } from "./interview-workspace.js";
import type { JobPostingCollectionService } from "./job-posting-collections.js";
import type { SlackNotificationService } from "./slack-notifications.js";

export type WorkerAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    adminUserId: string;
    requestId: string;
    signedEventId: string;
  };
};

export type AppDependencies = {
  analysisJobServiceFactory?: (env: CloudflareBindings) => AnalysisJobService;
  applicationServiceFactory?: (env: CloudflareBindings) => ApplicationService;
  documentServiceFactory?: (env: CloudflareBindings) => DocumentService;
  idempotencyServiceFactory?: (env: CloudflareBindings) => IdempotencyService;
  jobPostingCollectionServiceFactory?: (
    env: CloudflareBindings,
  ) => JobPostingCollectionService;
  interviewWorkspaceServiceFactory?: (
    env: CloudflareBindings,
  ) => InterviewWorkspaceService;
  slackNotificationServiceFactory?: (
    env: CloudflareBindings,
  ) => SlackNotificationService;
  jwtVerificationKey?: JwtVerificationKey;
};

export type AppRouteDependencies = {
  app: Hono<WorkerAppEnv>;
  requireAdmin: MiddlewareHandler<WorkerAppEnv>;
  getAnalysisJobService: (env: CloudflareBindings) => AnalysisJobService;
  getApplicationService: (env: CloudflareBindings) => ApplicationService;
  getDocumentService: (env: CloudflareBindings) => DocumentService;
  getIdempotencyService: (env: CloudflareBindings) => IdempotencyService;
  getInterviewWorkspaceService: (
    env: CloudflareBindings,
  ) => InterviewWorkspaceService;
  getJobPostingCollectionService: (
    env: CloudflareBindings,
  ) => JobPostingCollectionService;
  getSlackNotificationService:
    | ((env: CloudflareBindings) => SlackNotificationService)
    | null;
};
