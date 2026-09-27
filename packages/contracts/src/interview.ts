import * as z from "zod";

import { NullableWorkspaceTextSchema } from "./analysis-runtime";
import { EvidenceSchema, MatchStatusSchema, PrioritySchema } from "./common";
import { Rfc3339TimestampSchema, UuidSchema } from "./job-postings";

export const AnalysisRequirementReviewSchema = z
  .strictObject({
    requirementId: z.string().min(1).max(100),
    overrideStatus: MatchStatusSchema.nullable(),
    note: NullableWorkspaceTextSchema(5_000),
  })
  .refine((value) => value.overrideStatus !== null || value.note !== null, {
    message: "A requirement review must contain a status or note",
  });

export type AnalysisRequirementReview = z.infer<
  typeof AnalysisRequirementReviewSchema
>;

export const AnalysisReviewSchema = z.strictObject({
  overallNote: NullableWorkspaceTextSchema(20_000),
  requirements: z.array(AnalysisRequirementReviewSchema).max(40),
  updatedAt: Rfc3339TimestampSchema.nullable(),
});

export type AnalysisReview = z.infer<typeof AnalysisReviewSchema>;

export const AnalysisReviewResponseSchema = z.strictObject({
  data: z.strictObject({
    review: AnalysisReviewSchema,
    reviewedFitScore: z.int().min(0).max(100).nullable(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type AnalysisReviewResponse = z.infer<
  typeof AnalysisReviewResponseSchema
>;

export const UpdateAnalysisReviewRequestSchema = z
  .strictObject({
    overallNote: NullableWorkspaceTextSchema(20_000),
    requirements: z.array(AnalysisRequirementReviewSchema).max(40),
    expectedUpdatedAt: Rfc3339TimestampSchema.nullable(),
  })
  .superRefine((value, context) => {
    const ids = value.requirements.map((item) => item.requirementId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Requirement reviews must be unique",
        path: ["requirements"],
      });
    }
  });

export type UpdateAnalysisReviewRequest = z.infer<
  typeof UpdateAnalysisReviewRequestSchema
>;

export const InterviewAnswerRevisionSchema = z.strictObject({
  id: UuidSchema,
  questionId: UuidSchema,
  revision: z.int().positive(),
  answer: NullableWorkspaceTextSchema(20_000),
  createdAt: Rfc3339TimestampSchema,
});

export type InterviewAnswerRevision = z.infer<
  typeof InterviewAnswerRevisionSchema
>;

export const InterviewQuestionSchema = z.strictObject({
  id: UuidSchema,
  analysisJobId: UuidSchema,
  sourceIndex: z.int().nonnegative(),
  category: z.string().min(1).max(200),
  question: z.string().min(1).max(2_000),
  intent: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  requirementIds: z.array(z.string().min(1).max(100)).max(10),
  answerOutline: z.string().max(3_000).nullable().default(null),
  modelAnswer: z.string().max(5_000).nullable().default(null),
  answerEvidence: z.array(EvidenceSchema).max(10).default([]),
  currentAnswer: InterviewAnswerRevisionSchema.nullable(),
  answerRevisionCount: z.int().nonnegative(),
  createdAt: Rfc3339TimestampSchema,
});

export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

export const SaveInterviewAnswerRequestSchema = z.strictObject({
  answer: NullableWorkspaceTextSchema(20_000),
});

export type SaveInterviewAnswerRequest = z.infer<
  typeof SaveInterviewAnswerRequestSchema
>;

export const InterviewAnswerResponseSchema = z.strictObject({
  data: z.strictObject({
    currentAnswer: InterviewAnswerRevisionSchema.nullable(),
    revisionCount: z.int().nonnegative(),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type InterviewAnswerResponse = z.infer<
  typeof InterviewAnswerResponseSchema
>;

export const InterviewAnswerHistoryResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(InterviewAnswerRevisionSchema).max(100),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type InterviewAnswerHistoryResponse = z.infer<
  typeof InterviewAnswerHistoryResponseSchema
>;

export const InterviewChecklistSourceSchema = z.enum(["gap_action", "custom"]);

export type InterviewChecklistSource = z.infer<
  typeof InterviewChecklistSourceSchema
>;

export const InterviewChecklistItemSchema = z.strictObject({
  id: UuidSchema,
  analysisJobId: UuidSchema,
  source: InterviewChecklistSourceSchema,
  sourceKey: z.string().max(100).nullable(),
  content: z.string().min(1).max(2_000),
  priority: PrioritySchema,
  position: z.int().nonnegative(),
  completedAt: Rfc3339TimestampSchema.nullable(),
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export type InterviewChecklistItem = z.infer<
  typeof InterviewChecklistItemSchema
>;

export const CreateInterviewChecklistItemRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(2_000),
  priority: PrioritySchema,
});

export type CreateInterviewChecklistItemRequest = z.infer<
  typeof CreateInterviewChecklistItemRequestSchema
>;

export const PatchInterviewChecklistItemRequestSchema = z
  .strictObject({
    content: z.string().trim().min(1).max(2_000).optional(),
    priority: PrioritySchema.optional(),
    completed: z.boolean().optional(),
    expectedUpdatedAt: Rfc3339TimestampSchema,
  })
  .refine(
    (value) =>
      value.content !== undefined ||
      value.priority !== undefined ||
      value.completed !== undefined,
    { message: "At least one checklist field must be updated" },
  );

export type PatchInterviewChecklistItemRequest = z.infer<
  typeof PatchInterviewChecklistItemRequestSchema
>;

export const ReorderInterviewChecklistRequestSchema = z
  .strictObject({
    itemIds: z.array(UuidSchema).min(1).max(100),
  })
  .refine((value) => new Set(value.itemIds).size === value.itemIds.length, {
    message: "Checklist item IDs must be unique",
  });

export type ReorderInterviewChecklistRequest = z.infer<
  typeof ReorderInterviewChecklistRequestSchema
>;

export const InterviewChecklistItemResponseSchema = z.strictObject({
  data: InterviewChecklistItemSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type InterviewChecklistItemResponse = z.infer<
  typeof InterviewChecklistItemResponseSchema
>;

export const InterviewChecklistListResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(InterviewChecklistItemSchema).max(100),
  }),
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type InterviewChecklistListResponse = z.infer<
  typeof InterviewChecklistListResponseSchema
>;

const InterviewNoteContentSchema = z.strictObject({
  questionsAsked: NullableWorkspaceTextSchema(20_000),
  wentWell: NullableWorkspaceTextSchema(20_000),
  improvements: NullableWorkspaceTextSchema(20_000),
  followUpActions: NullableWorkspaceTextSchema(20_000),
  content: NullableWorkspaceTextSchema(20_000),
});

export const InterviewNoteSchema = InterviewNoteContentSchema.extend({
  id: UuidSchema,
  applicationId: UuidSchema,
  analysisJobId: UuidSchema,
  roundLabel: z.string().min(1).max(100),
  interviewedAt: Rfc3339TimestampSchema,
  archivedAt: Rfc3339TimestampSchema.nullable(),
  createdAt: Rfc3339TimestampSchema,
  updatedAt: Rfc3339TimestampSchema,
});

export type InterviewNote = z.infer<typeof InterviewNoteSchema>;

const InterviewNoteInputSchema = InterviewNoteContentSchema.extend({
  roundLabel: z.string().trim().min(1).max(100),
  interviewedAt: Rfc3339TimestampSchema,
});

function hasInterviewNoteContent(
  value: z.infer<typeof InterviewNoteContentSchema>,
) {
  return [
    value.questionsAsked,
    value.wentWell,
    value.improvements,
    value.followUpActions,
    value.content,
  ].some((item) => item !== null);
}

export const CreateInterviewNoteRequestSchema = InterviewNoteInputSchema.extend(
  {
    analysisJobId: UuidSchema,
  },
).refine(hasInterviewNoteContent, {
  message: "At least one interview note field is required",
});

export type CreateInterviewNoteRequest = z.infer<
  typeof CreateInterviewNoteRequestSchema
>;

export const PatchInterviewNoteRequestSchema = InterviewNoteInputSchema.extend({
  expectedUpdatedAt: Rfc3339TimestampSchema,
}).refine(hasInterviewNoteContent, {
  message: "At least one interview note field is required",
});

export type PatchInterviewNoteRequest = z.infer<
  typeof PatchInterviewNoteRequestSchema
>;

export const InterviewNoteResponseSchema = z.strictObject({
  data: InterviewNoteSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});

export type InterviewNoteResponse = z.infer<typeof InterviewNoteResponseSchema>;

export const ExpectedUpdatedAtQuerySchema = z.strictObject({
  expectedUpdatedAt: Rfc3339TimestampSchema,
});

export type ExpectedUpdatedAtQuery = z.infer<
  typeof ExpectedUpdatedAtQuerySchema
>;
