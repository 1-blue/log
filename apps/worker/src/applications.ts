import {
  type ApplicationDetail,
  type ApplicationDocumentSelection,
  type ApplicationJobPosting,
  type ApplicationListQuery,
  type ApplicationStateInput,
  ApplicationStateInputSchema,
  type ApplicationSummary,
  type CreateApplicationRequest,
  type PatchApplicationRequest,
  type PatchJobPostingRequest,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type DocumentRow = Database["public"]["Tables"]["document_versions"]["Row"];
type JobPostingRow = Database["public"]["Tables"]["job_postings"]["Row"];
type StatusHistoryRow =
  Database["public"]["Tables"]["application_status_history"]["Row"];

type ApplicationListResult = {
  items: ApplicationSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export class ApplicationServiceError extends Error {
  constructor(
    readonly kind: "conflict" | "not_found" | "unavailable" | "validation",
    readonly details: Record<string, string> | null = null,
  ) {
    super(kind);
    this.name = "ApplicationServiceError";
  }
}

export interface ApplicationService {
  create(
    ownerId: string,
    input: CreateApplicationRequest,
  ): Promise<ApplicationDetail>;
  createAttempt(
    ownerId: string,
    jobPostingId: string,
    input: ApplicationStateInput,
  ): Promise<ApplicationDetail>;
  get(ownerId: string, applicationId: string): Promise<ApplicationDetail>;
  list(
    ownerId: string,
    query: ApplicationListQuery,
  ): Promise<ApplicationListResult>;
  update(
    ownerId: string,
    applicationId: string,
    input: PatchApplicationRequest,
  ): Promise<ApplicationDetail>;
  updateJobPosting(
    ownerId: string,
    jobPostingId: string,
    input: PatchJobPostingRequest,
  ): Promise<ApplicationJobPosting>;
}

function createSupabaseAdminClient(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function normalizeWantedUrl(value: string) {
  const url = new URL(value);
  const externalId = url.pathname.match(/^\/wd\/(\d+)$/)?.[1];
  if (!externalId) throw new ApplicationServiceError("validation");
  return {
    externalId,
    canonicalUrl: `https://www.wanted.co.kr/wd/${externalId}`,
  };
}

function mapDocument(row: DocumentRow): ApplicationDocumentSelection {
  return {
    archivedAt: row.archived_at,
    documentType: row.document_type,
    id: row.id,
    label: row.label,
    originalFilename: row.original_filename,
  };
}

function mapApplication(
  application: ApplicationRow,
  posting: JobPostingRow,
  documents: ApplicationDocumentSelection[],
): ApplicationSummary {
  return {
    appliedOn: application.applied_on,
    archivedAt: application.archived_at,
    attemptNumber: application.attempt_number,
    createdAt: application.created_at,
    documents: {
      portfolio:
        documents.find((item) => item.documentType === "portfolio") ?? null,
      resume: documents.find((item) => item.documentType === "resume") ?? null,
    },
    documentsLockedAt: application.documents_locked_at,
    id: application.id,
    interviewAt: application.interview_at,
    jobPosting: {
      companyName: posting.company_name,
      createdAt: posting.created_at,
      externalId: posting.external_id,
      id: posting.id,
      source: posting.source,
      title: posting.title,
      updatedAt: posting.updated_at,
      url: posting.canonical_url,
    },
    note: application.note,
    status: application.status,
    updatedAt: application.updated_at,
  };
}

function mapDatabaseError(error: { code?: string; message?: string }) {
  if (error.code === "P0002") return new ApplicationServiceError("not_found");
  if (error.code === "23505") {
    return new ApplicationServiceError("conflict", {
      reason: "duplicate_job_posting",
    });
  }
  if (error.code === "23503" || error.code === "23514") {
    const message = error.message ?? "";
    const reason = message.includes("archived document")
      ? "archived_document"
      : message.includes("cannot be changed")
        ? "documents_locked"
        : message.includes("restored")
          ? "archived_application"
          : "invalid_application_state";
    return new ApplicationServiceError("conflict", { reason });
  }
  return new ApplicationServiceError("unavailable");
}

class SupabaseApplicationService implements ApplicationService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  private async getDocuments(
    ownerId: string,
    applicationIds: string[],
  ): Promise<Map<string, ApplicationDocumentSelection[]>> {
    const result = new Map<string, ApplicationDocumentSelection[]>();
    if (applicationIds.length === 0) return result;

    const { data: selections, error } = await this.supabase
      .from("application_documents")
      .select("application_id, document_version_id")
      .eq("owner_id", ownerId)
      .in("application_id", applicationIds);
    if (error) throw new ApplicationServiceError("unavailable");
    if (selections.length === 0) return result;

    const versionIds = [
      ...new Set(selections.map((item) => item.document_version_id)),
    ];
    const { data: versions, error: versionsError } = await this.supabase
      .from("document_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", versionIds);
    if (versionsError) throw new ApplicationServiceError("unavailable");
    const versionsById = new Map(versions.map((row) => [row.id, row]));

    for (const selection of selections) {
      const version = versionsById.get(selection.document_version_id);
      if (!version) throw new ApplicationServiceError("unavailable");
      const current = result.get(selection.application_id) ?? [];
      current.push(mapDocument(version));
      result.set(selection.application_id, current);
    }
    return result;
  }

  private async getRows(ownerId: string, applicationId: string) {
    const { data: application, error } = await this.supabase
      .from("applications")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw new ApplicationServiceError("unavailable");
    if (!application) throw new ApplicationServiceError("not_found");

    const { data: posting, error: postingError } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", application.job_posting_id)
      .maybeSingle();
    if (postingError) throw new ApplicationServiceError("unavailable");
    if (!posting) throw new ApplicationServiceError("not_found");
    return { application, posting };
  }

  async get(ownerId: string, applicationId: string) {
    const { application, posting } = await this.getRows(ownerId, applicationId);
    const documents = await this.getDocuments(ownerId, [applicationId]);
    const { data: history, error } = await this.supabase
      .from("application_status_history")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: false })
      .limit(500);
    if (error) throw new ApplicationServiceError("unavailable");

    return {
      ...mapApplication(
        application,
        posting,
        documents.get(applicationId) ?? [],
      ),
      statusHistory: history.map((row: StatusHistoryRow) => ({
        changedAt: row.changed_at,
        fromStatus: row.from_status,
        id: row.id,
        toStatus: row.to_status,
      })),
    };
  }

  async create(ownerId: string, input: CreateApplicationRequest) {
    const { externalId, canonicalUrl } = normalizeWantedUrl(input.url);
    const { data: duplicate, error: duplicateError } = await this.supabase
      .from("job_postings")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("source", input.source)
      .eq("external_id", externalId)
      .maybeSingle();
    if (duplicateError) throw new ApplicationServiceError("unavailable");
    if (duplicate) {
      const { data: latest } = await this.supabase
        .from("applications")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("job_posting_id", duplicate.id)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      throw new ApplicationServiceError("conflict", {
        jobPostingId: duplicate.id,
        ...(latest ? { latestApplicationId: latest.id } : {}),
        reason: "duplicate_job_posting",
      });
    }

    const { data, error } = await this.supabase.rpc(
      "create_application_with_posting",
      {
        p_applied_on: input.appliedOn,
        p_canonical_url: canonicalUrl,
        p_company_name: input.companyName,
        p_external_id: externalId,
        p_interview_at: input.interviewAt,
        p_note: input.note,
        p_owner_id: ownerId,
        p_portfolio_version_id: input.portfolioVersionId,
        p_resume_version_id: input.resumeVersionId,
        p_source: input.source,
        p_status: input.status,
        p_title: input.title,
      } as never,
    );
    if (error) throw mapDatabaseError(error);
    return this.get(ownerId, data.id);
  }

  async createAttempt(
    ownerId: string,
    jobPostingId: string,
    input: ApplicationStateInput,
  ) {
    const { data, error } = await this.supabase.rpc(
      "create_application_attempt",
      {
        p_applied_on: input.appliedOn,
        p_interview_at: input.interviewAt,
        p_job_posting_id: jobPostingId,
        p_note: input.note,
        p_owner_id: ownerId,
        p_portfolio_version_id: input.portfolioVersionId,
        p_resume_version_id: input.resumeVersionId,
        p_status: input.status,
      } as never,
    );
    if (error) throw mapDatabaseError(error);
    return this.get(ownerId, data.id);
  }

  async list(ownerId: string, filters: ApplicationListQuery) {
    let postingIds: string[] | null = null;
    if (filters.q) {
      const escaped = filters.q.replaceAll("%", "\\%").replaceAll("_", "\\_");
      const { data, error } = await this.supabase
        .from("job_postings")
        .select("id")
        .eq("owner_id", ownerId)
        .ilike("search_text", `%${escaped}%`);
      if (error) throw new ApplicationServiceError("unavailable");
      postingIds = data.map((row) => row.id);
      if (postingIds.length === 0) {
        return {
          items: [],
          page: filters.page,
          pageSize: filters.pageSize,
          total: 0,
          totalPages: 0,
        };
      }
    }

    let query = this.supabase
      .from("applications")
      .select("*", { count: "exact" })
      .eq("owner_id", ownerId);
    if (postingIds) query = query.in("job_posting_id", postingIds);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.archived === "exclude") query = query.is("archived_at", null);
    if (filters.archived === "only")
      query = query.not("archived_at", "is", null);

    if (filters.sort === "interview_asc") {
      query = query.order("interview_at", {
        ascending: true,
        nullsFirst: false,
      });
    } else if (filters.sort === "applied_desc") {
      query = query.order("applied_on", {
        ascending: false,
        nullsFirst: false,
      });
    } else {
      query = query.order("updated_at", { ascending: false });
    }
    const from = (filters.page - 1) * filters.pageSize;
    const {
      data: applications,
      error,
      count,
    } = await query
      .order("id", { ascending: false })
      .range(from, from + filters.pageSize - 1);
    if (error) throw new ApplicationServiceError("unavailable");

    const postingIdList = [
      ...new Set(applications.map((row) => row.job_posting_id)),
    ];
    const { data: postings, error: postingError } = postingIdList.length
      ? await this.supabase
          .from("job_postings")
          .select("*")
          .eq("owner_id", ownerId)
          .in("id", postingIdList)
      : { data: [], error: null };
    if (postingError) throw new ApplicationServiceError("unavailable");
    const postingsById = new Map(postings.map((row) => [row.id, row]));
    const documents = await this.getDocuments(
      ownerId,
      applications.map((row) => row.id),
    );
    const items = applications.map((application) => {
      const posting = postingsById.get(application.job_posting_id);
      if (!posting) throw new ApplicationServiceError("unavailable");
      return mapApplication(
        application,
        posting,
        documents.get(application.id) ?? [],
      );
    });
    const total = count ?? 0;
    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.pageSize),
    };
  }

  async update(
    ownerId: string,
    applicationId: string,
    input: PatchApplicationRequest,
  ) {
    const current = await this.get(ownerId, applicationId);
    if (
      current.archivedAt &&
      !(Object.keys(input).length === 1 && input.archived === false)
    ) {
      throw new ApplicationServiceError("conflict", {
        reason: "archived_application",
      });
    }

    const state = ApplicationStateInputSchema.safeParse({
      appliedOn:
        input.appliedOn === undefined ? current.appliedOn : input.appliedOn,
      interviewAt:
        input.interviewAt === undefined
          ? current.interviewAt
          : input.interviewAt,
      note: input.note === undefined ? current.note : input.note,
      portfolioVersionId:
        input.portfolioVersionId === undefined
          ? (current.documents.portfolio?.id ?? null)
          : input.portfolioVersionId,
      resumeVersionId:
        input.resumeVersionId === undefined
          ? (current.documents.resume?.id ?? null)
          : input.resumeVersionId,
      status: input.status ?? current.status,
    });
    if (!state.success) {
      throw new ApplicationServiceError("validation", {
        reason: "invalid_application_state",
      });
    }

    const { data, error } = await this.supabase.rpc(
      "replace_application_state",
      {
        p_application_id: applicationId,
        p_applied_on: state.data.appliedOn,
        p_archived: input.archived ?? Boolean(current.archivedAt),
        p_interview_at: state.data.interviewAt,
        p_note: state.data.note,
        p_owner_id: ownerId,
        p_portfolio_version_id: state.data.portfolioVersionId,
        p_resume_version_id: state.data.resumeVersionId,
        p_status: state.data.status,
      } as never,
    );
    if (error) throw mapDatabaseError(error);
    return this.get(ownerId, data.id);
  }

  async updateJobPosting(
    ownerId: string,
    jobPostingId: string,
    input: PatchJobPostingRequest,
  ) {
    const { data: current, error: currentError } = await this.supabase
      .from("job_postings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", jobPostingId)
      .maybeSingle();
    if (currentError) throw new ApplicationServiceError("unavailable");
    if (!current) throw new ApplicationServiceError("not_found");

    const { data, error } = await this.supabase.rpc(
      "update_job_posting_details",
      {
        p_company_name: input.companyName ?? current.company_name,
        p_job_posting_id: jobPostingId,
        p_owner_id: ownerId,
        p_title: input.title ?? current.title,
      },
    );
    if (error) throw mapDatabaseError(error);
    if (!data) throw new ApplicationServiceError("not_found");

    return {
      companyName: data.company_name,
      createdAt: data.created_at,
      externalId: data.external_id,
      id: data.id,
      source: data.source,
      title: data.title,
      updatedAt: data.updated_at,
      url: data.canonical_url,
    };
  }
}

export function createApplicationService(
  env: CloudflareBindings,
): ApplicationService {
  return new SupabaseApplicationService(createSupabaseAdminClient(env));
}
