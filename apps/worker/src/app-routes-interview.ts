import {
  AnalysisWorkspaceQuerySchema,
  CreateInterviewChecklistItemRequestSchema,
  CreateInterviewNoteRequestSchema,
  ExpectedUpdatedAtQuerySchema,
  PatchInterviewChecklistItemRequestSchema,
  PatchInterviewNoteRequestSchema,
  ReorderInterviewChecklistRequestSchema,
  SaveInterviewAnswerRequestSchema,
  UpdateAnalysisReviewRequestSchema,
} from "@workspace/contracts";

import { interviewWorkspaceErrorResponse } from "./app-errors.js";
import {
  errorResponse,
  executeIdempotently,
  jsonData,
  parseJsonBody,
  parseResourceId,
} from "./app-response.js";
import type { AppRouteDependencies } from "./app-types.js";

export function registerInterviewRoutes(routes: AppRouteDependencies) {
  const {
    app,
    requireAdmin,
    getIdempotencyService,
    getInterviewWorkspaceService,
  } = routes;

  app.get("/v1/analysis-jobs/:id/workspace", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const query = AnalysisWorkspaceQuerySchema.safeParse({
      compareTo: c.req.query("compareTo"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "분석 비교 조건이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).getWorkspace(
        c.get("adminUserId"),
        analysisJobId,
        query.data.compareTo,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/analysis-jobs/:id/review", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(c, UpdateAnalysisReviewRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).saveReview(
        c.get("adminUserId"),
        analysisJobId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.get("/v1/interview-questions/:id/answers", requireAdmin, async (c) => {
    const questionId = parseResourceId(c, "면접 질문");
    if (questionId instanceof Response) return questionId;
    try {
      const items = await getInterviewWorkspaceService(c.env).listAnswers(
        c.get("adminUserId"),
        questionId,
      );
      return jsonData(c, { items });
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/interview-questions/:id/answer", requireAdmin, async (c) => {
    const questionId = parseResourceId(c, "면접 질문");
    if (questionId instanceof Response) return questionId;
    const input = await parseJsonBody(c, SaveInterviewAnswerRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).saveAnswer(
        c.get("adminUserId"),
        questionId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.post("/v1/analysis-jobs/:id/checklist-items", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      CreateInterviewChecklistItemRequestSchema,
    );
    if (input instanceof Response) return input;
    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getInterviewWorkspaceService(
            c.env,
          ).createChecklist(c.get("adminUserId"), analysisJobId, input);
          return jsonData(c, data, 201);
        } catch (error) {
          return interviewWorkspaceErrorResponse(c, error);
        }
      },
    );
  });

  app.patch("/v1/interview-checklist-items/:id", requireAdmin, async (c) => {
    const itemId = parseResourceId(c, "체크리스트 항목");
    if (itemId instanceof Response) return itemId;
    const input = await parseJsonBody(
      c,
      PatchInterviewChecklistItemRequestSchema,
    );
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).patchChecklist(
        c.get("adminUserId"),
        itemId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.delete("/v1/interview-checklist-items/:id", requireAdmin, async (c) => {
    const itemId = parseResourceId(c, "체크리스트 항목");
    if (itemId instanceof Response) return itemId;
    const query = ExpectedUpdatedAtQuerySchema.safeParse({
      expectedUpdatedAt: c.req.query("expectedUpdatedAt"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "체크리스트 수정 시각이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).archiveChecklist(
        c.get("adminUserId"),
        itemId,
        query.data.expectedUpdatedAt,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.put("/v1/analysis-jobs/:id/checklist-order", requireAdmin, async (c) => {
    const analysisJobId = parseResourceId(c, "분석 작업");
    if (analysisJobId instanceof Response) return analysisJobId;
    const input = await parseJsonBody(
      c,
      ReorderInterviewChecklistRequestSchema,
    );
    if (input instanceof Response) return input;
    try {
      const items = await getInterviewWorkspaceService(c.env).reorderChecklist(
        c.get("adminUserId"),
        analysisJobId,
        input.itemIds,
      );
      return jsonData(c, { items });
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.post("/v1/applications/:id/interview-notes", requireAdmin, async (c) => {
    const applicationId = parseResourceId(c, "지원");
    if (applicationId instanceof Response) return applicationId;
    const input = await parseJsonBody(c, CreateInterviewNoteRequestSchema);
    if (input instanceof Response) return input;
    return executeIdempotently(
      c,
      getIdempotencyService(c.env),
      input,
      async () => {
        try {
          const data = await getInterviewWorkspaceService(c.env).createNote(
            c.get("adminUserId"),
            applicationId,
            input,
          );
          return jsonData(c, data, 201);
        } catch (error) {
          return interviewWorkspaceErrorResponse(c, error);
        }
      },
    );
  });

  app.patch("/v1/interview-notes/:id", requireAdmin, async (c) => {
    const noteId = parseResourceId(c, "면접 회고");
    if (noteId instanceof Response) return noteId;
    const input = await parseJsonBody(c, PatchInterviewNoteRequestSchema);
    if (input instanceof Response) return input;
    try {
      const data = await getInterviewWorkspaceService(c.env).patchNote(
        c.get("adminUserId"),
        noteId,
        input,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });

  app.delete("/v1/interview-notes/:id", requireAdmin, async (c) => {
    const noteId = parseResourceId(c, "면접 회고");
    if (noteId instanceof Response) return noteId;
    const query = ExpectedUpdatedAtQuerySchema.safeParse({
      expectedUpdatedAt: c.req.query("expectedUpdatedAt"),
    });
    if (!query.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "면접 회고 수정 시각이 올바르지 않습니다.",
      );
    }
    try {
      const data = await getInterviewWorkspaceService(c.env).archiveNote(
        c.get("adminUserId"),
        noteId,
        query.data.expectedUpdatedAt,
      );
      return jsonData(c, data);
    } catch (error) {
      return interviewWorkspaceErrorResponse(c, error);
    }
  });
}
