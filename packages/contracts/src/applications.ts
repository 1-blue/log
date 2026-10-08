import * as z from "zod";

import type { ApplicationStatus } from "./common";
import {
  applicationStatusRequiresDocuments,
  ApplicationStatusSchema,
} from "./common";
import { JobPostingUrlSchema } from "./job-platforms";
import {
  DocumentTypeSchema,
  JobPostingSourceSchema,
  Rfc3339TimestampSchema,
  UuidSchema,
} from "./job-postings";

export const CreateJobPostingRequestSchema = z.strictObject({
  source: JobPostingSourceSchema,
  url: JobPostingUrlSchema,
  manualContent: z.string().max(100_000).nullable(),
});

export type CreateJobPostingRequest = z.infer<
  typeof CreateJobPostingRequestSchema
>;

export const JobPostingResponseSchema = z.strictObject({
  id: UuidSchema,
  source: JobPostingSourceSchema,
  url: JobPostingUrlSchema,
  title: z.string().max(500).nullable(),
  companyName: z.string().max(500).nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export const CreateJobPostingResponseSchema = z.strictObject({
  data: JobPostingResponseSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export const ApplicationArchiveFilterSchema = z.enum([
  "exclude",
  "include",
  "only",
]);

export type ApplicationArchiveFilter = z.infer<
  typeof ApplicationArchiveFilterSchema
>;

export const ApplicationSortSchema = z.enum([
  "updated_desc",
  "interview_asc",
  "applied_desc",
]);

export type ApplicationSort = z.infer<typeof ApplicationSortSchema>;

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date is required")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    );
  }, "A valid calendar date is required");

const ApplicationCompanyNameSchema = z.string().trim().min(1).max(200);

const ApplicationTitleSchema = z.string().trim().min(1).max(300);

const ApplicationNoteSchema = z.string().trim().max(10_000).nullable();

const ApplicationStateShape = {
  status: ApplicationStatusSchema,
  appliedOn: DateOnlySchema.nullable(),
  interviewAt: Rfc3339TimestampSchema.nullable(),
  note: ApplicationNoteSchema,
  resumeVersionId: UuidSchema.nullable(),
  portfolioVersionId: UuidSchema.nullable(),
};

function validateApplicationDocuments(
  value: {
    status: ApplicationStatus;
    resumeVersionId: string | null;
    portfolioVersionId: string | null;
  },
  context: z.RefinementCtx,
) {
  if (
    applicationStatusRequiresDocuments(value.status) &&
    (!value.resumeVersionId || !value.portfolioVersionId)
  ) {
    context.addIssue({
      code: "custom",
      message: "Submitted applications require resume and portfolio versions",
      path: [!value.resumeVersionId ? "resumeVersionId" : "portfolioVersionId"],
    });
  }
}

export const ApplicationStateInputSchema = z
  .strictObject(ApplicationStateShape)
  .superRefine(validateApplicationDocuments);

export type ApplicationStateInput = z.infer<typeof ApplicationStateInputSchema>;

export const CreateApplicationRequestSchema = z
  .strictObject({
    source: JobPostingSourceSchema,
    url: JobPostingUrlSchema,
    companyName: ApplicationCompanyNameSchema.nullable().optional(),
    title: ApplicationTitleSchema.nullable().optional(),
    ...ApplicationStateShape,
  })
  .superRefine(validateApplicationDocuments);

export type CreateApplicationRequest = z.infer<
  typeof CreateApplicationRequestSchema
>;

export const CreateApplicationAttemptRequestSchema =
  ApplicationStateInputSchema;

export type CreateApplicationAttemptRequest = z.infer<
  typeof CreateApplicationAttemptRequestSchema
>;

export const PatchApplicationRequestSchema = z
  .strictObject({
    status: ApplicationStatusSchema.optional(),
    appliedOn: DateOnlySchema.nullable().optional(),
    interviewAt: Rfc3339TimestampSchema.nullable().optional(),
    note: ApplicationNoteSchema.optional(),
    resumeVersionId: UuidSchema.nullable().optional(),
    portfolioVersionId: UuidSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one application field is required",
  });

export type PatchApplicationRequest = z.infer<
  typeof PatchApplicationRequestSchema
>;

export const PatchJobPostingRequestSchema = z
  .strictObject({
    companyName: ApplicationCompanyNameSchema.optional(),
    title: ApplicationTitleSchema.optional(),
    source: JobPostingSourceSchema.optional(),
  })
  .refine(
    (value) =>
      value.companyName !== undefined ||
      value.title !== undefined ||
      value.source !== undefined,
    "At least one job posting field is required",
  );

export type PatchJobPostingRequest = z.infer<
  typeof PatchJobPostingRequestSchema
>;

export const ApplicationDocumentSelectionSchema = z.strictObject({
  id: UuidSchema,
  documentType: DocumentTypeSchema,
  label: z.string().min(1).max(100),
  originalFilename: z.string().min(1).max(255),
  archivedAt: Rfc3339TimestampSchema.nullable(),
});

export type ApplicationDocumentSelection = z.infer<
  typeof ApplicationDocumentSelectionSchema
>;

export const ApplicationJobPostingSchema = z.strictObject({
  id: UuidSchema,
  metadataStatus: z.enum(["pending", "confirmed"]),
  source: JobPostingSourceSchema,
  externalId: z.string().min(1).max(200),
  url: JobPostingUrlSchema,
  companyName: ApplicationCompanyNameSchema,
  title: ApplicationTitleSchema,
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export type ApplicationJobPosting = z.infer<typeof ApplicationJobPostingSchema>;

export const ApplicationJobPostingResponseSchema = z.strictObject({
  data: ApplicationJobPostingSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type ApplicationJobPostingResponse = z.infer<
  typeof ApplicationJobPostingResponseSchema
>;

export const ApplicationSummarySchema = z.strictObject({
  id: UuidSchema,
  attemptNumber: z.int().positive(),
  status: ApplicationStatusSchema,
  appliedOn: DateOnlySchema.nullable(),
  interviewAt: Rfc3339TimestampSchema.nullable(),
  note: ApplicationNoteSchema,
  documentsLockedAt: Rfc3339TimestampSchema.nullable(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
  jobPosting: ApplicationJobPostingSchema,
  documents: z.strictObject({
    resume: ApplicationDocumentSelectionSchema.nullable(),
    portfolio: ApplicationDocumentSelectionSchema.nullable(),
  }),
});

export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

export const ApplicationStatusHistorySchema = z.strictObject({
  id: UuidSchema,
  fromStatus: ApplicationStatusSchema.nullable(),
  toStatus: ApplicationStatusSchema,
  changedAt: Rfc3339TimestampSchema,
});

export type ApplicationStatusHistory = z.infer<
  typeof ApplicationStatusHistorySchema
>;

export const ApplicationDetailSchema = ApplicationSummarySchema.extend({
  statusHistory: z.array(ApplicationStatusHistorySchema).max(500),
});

export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;

export const ApplicationResponseSchema = z.strictObject({
  data: ApplicationDetailSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;

export const ApplicationListQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  status: ApplicationStatusSchema.optional(),
  archived: ApplicationArchiveFilterSchema.default("exclude"),
  sort: ApplicationSortSchema.default("updated_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ApplicationListQuery = z.infer<typeof ApplicationListQuerySchema>;

export const ApplicationListResponseSchema = z.strictObject({
  data: z.strictObject({ items: z.array(ApplicationSummarySchema) }),
  pagination: z.strictObject({
    page: z.int().positive(),
    pageSize: z.int().positive().max(50),
    total: z.int().nonnegative(),
    totalPages: z.int().nonnegative(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type ApplicationListResponse = z.infer<
  typeof ApplicationListResponseSchema
>;
