import * as z from "zod";

import { Rfc3339TimestampSchema, UuidSchema } from "./job-postings";

export const DeletionTargetSchema = z.enum(["application", "document"]);
export const DeletionPreviewSchema = z.strictObject({
  targetType: DeletionTargetSchema,
  targetId: UuidSchema,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  allowed: z.boolean(),
  blockers: z.array(
    z.strictObject({ id: UuidSchema, label: z.string(), reason: z.string() }),
  ),
  applications: z.array(z.strictObject({ id: UuidSchema, label: z.string() })),
  counts: z.record(z.string(), z.int().nonnegative()),
  preserves: z.array(z.string()),
});
export type DeletionPreview = z.infer<typeof DeletionPreviewSchema>;
export const DeleteResourceRequestSchema = z.strictObject({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export const DeletionOperationSchema = z.strictObject({
  id: UuidSchema,
  targetType: z.enum(["application", "document", "reset"]),
  targetId: UuidSchema.nullable(),
  status: z.enum(["pending", "completed", "failed"]),
  error: z.string().nullable(),
  createdAt: Rfc3339TimestampSchema,
  completedAt: Rfc3339TimestampSchema.nullable(),
});
export type DeletionOperation = z.infer<typeof DeletionOperationSchema>;
export const DeletionPreviewResponseSchema = z.strictObject({
  data: DeletionPreviewSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
export const DeletionOperationResponseSchema = z.strictObject({
  data: DeletionOperationSchema,
  meta: z.strictObject({ requestId: UuidSchema }),
});
