import {
  JOB_STRUCTURE_MODEL,
  JOB_STRUCTURE_PROMPT_VERSION,
  JOB_STRUCTURE_VERSION,
  type JobPostingStructuredExtraction,
  type N8nJobPostingCollectionDispatchPayload,
  type N8nJobPostingExtractionDispatchPayload,
} from "@workspace/contracts";
import type { Database } from "@workspace/contracts/database";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { buildAnalysisDispatchPayload } from "../src/analysis-job-dispatch.js";
import type { AnalysisJobRow, PostingRow } from "../src/analysis-job-types.js";
import { sha256Hex } from "../src/idempotency.js";
import {
  JobPostingCollectionServiceError,
  SupabaseJobPostingCollectionService,
} from "../src/job-posting-collections.js";
import { jobSourceText } from "../src/job-source-text.js";
import {
  bindJobFactsToSnapshot,
  JobStructureError,
  validateJobStructure,
} from "../src/job-structure.js";

const run = "00000000-0000-4000-8000-000000000123";
const source =
  "회사명: 테스트 회사\n공고명: 프론트엔드 개발자\n주요 업무\n웹 서비스를 개발하고 기존 화면의 데이터 흐름을 개선합니다.\n자격요건\nTypeScript 개발 경험\n팀과 함께 개발과 운영 문제를 해결하고 사용자의 피드백을 반영할 수 있는 분을 찾습니다.";
const extraction: JobPostingStructuredExtraction = {
  sourceComplete: true,
  metadata: {
    title: "프론트엔드 개발자",
    companyName: "테스트 회사",
    datePosted: null,
    validThrough: null,
    employmentType: null,
    location: null,
    industry: null,
    occupationalCategory: null,
  },
  evidence: [{ section: "자격요건", excerpt: "TypeScript 개발 경험" }],
  facts: {
    title: "프론트엔드 개발자",
    companyName: "테스트 회사",
    summary: "웹 서비스 개발자를 채용합니다.",
    bodySections: {
      companyIntroduction: null,
      positionIntroduction: null,
      expectations: null,
      mainResponsibilities:
        "웹 서비스를 개발하고 기존 화면의 데이터 흐름을 개선합니다.",
      requirements: "TypeScript 개발 경험",
      preferred: null,
      employmentConditions: null,
      process: null,
      benefits: null,
      technologies: null,
      traits: null,
      deadline: null,
      location: null,
      other: null,
    },
    requirements: [
      {
        id: "required-1",
        kind: "required",
        text: "TypeScript 개발 경험",
        evidence: [
          {
            source: "job_posting",
            sourceVersionId: run,
            section: "자격요건",
            excerpt: "TypeScript 개발 경험",
            context: null,
          },
        ],
      },
    ],
    technologies: [],
    traits: [],
    warnings: [],
  },
};

describe("platform-independent source cleanup", () => {
  it("preserves paragraphs and lists but never interprets JSON-LD or platform selectors", () => {
    expect(
      jobSourceText(
        '<script type="application/ld+json">{"title":"invented"}</script><style>secret</style><h2>업무</h2><p>A &amp; B</p><ul><li>첫번째</li><li>두번째</li></ul>',
        true,
      ),
    ).toBe("업무\nA & B\n- 첫번째\n- 두번째");
  });
  it("does not decode plain-source entities twice or remove literal comparison symbols", () => {
    const text = "Use &lt;T&gt; and a < b.\n\nNew paragraph";
    expect(jobSourceText(text)).toBe(text);
    expect(jobSourceText(jobSourceText(text))).toBe(text);
    expect(jobSourceText("&amp;lt;", true)).toBe("&lt;");
  });
});

const owner = "00000000-0000-4000-8000-000000000001";
const request = "00000000-0000-4000-8000-000000000002";
const snapshotId = "00000000-0000-4000-8000-000000000003";
const now = "2026-10-08T00:00:00.000Z";
const posting: PostingRow = {
  id: "00000000-0000-4000-8000-000000000004",
  owner_id: owner,
  source: "saramin",
  canonical_url:
    "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123",
  external_id: "a".repeat(64),
  title: "공고 확인 중",
  company_name: "공고 확인 중",
  search_text: null,
  created_at: now,
  updated_at: now,
};

function collectionFixture(cached = false) {
  const state = {
    cacheError: false,
    row: {
      id: run,
      owner_id: owner,
      job_posting_id: posting.id,
      request_id: request,
      mode: "manual",
      status: "running",
      structure_event_id: null as string | null,
      source_text_hash: null as string | null,
      final_event_id: null,
      snapshot_id: null,
      created_at: now,
      updated_at: now,
    },
  };
  const parsed = validateJobStructure({
    extraction,
    sourceText: source,
    collectionRunId: run,
  });
  const snapshot = {
    id: snapshotId,
    owner_id: owner,
    job_posting_id: posting.id,
    raw_content: source,
    normalized_content: parsed.normalizedContent,
    sections: parsed.sections,
    source_metadata: parsed.metadata,
    structured_facts: bindJobFactsToSnapshot(extraction.facts, snapshotId),
    structure_version: JOB_STRUCTURE_VERSION,
    structure_model: JOB_STRUCTURE_MODEL,
    structure_prompt_version: JOB_STRUCTURE_PROMPT_VERSION,
    parser_version: JOB_STRUCTURE_VERSION,
    source: "ai",
    created_at: now,
    fetched_at: now,
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_job_structuring") {
      if (state.row.structure_event_id) return { data: false, error: null };
      state.row.structure_event_id = args.p_event_id as string;
      state.row.source_text_hash = args.p_source_hash as string;
      return { data: true, error: null };
    }
    return {
      data: { ...state.row, status: args.p_status, snapshot_id: snapshotId },
      error: null,
    };
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        filters[field] = value;
        return query;
      },
      maybeSingle: async () => ({
        data:
          table === "job_postings"
            ? posting
            : table === "job_posting_collection_runs"
              ? state.row
              : filters.id || cached
                ? snapshot
                : null,
        error:
          table === "job_posting_snapshots" && state.cacheError
            ? { code: "503" }
            : null,
      }),
    };
    return query;
  });
  const supabase = { from, rpc } as unknown as SupabaseClient<Database>;
  const dispatch = vi
    .fn<
      (
        payload:
          | N8nJobPostingExtractionDispatchPayload
          | N8nJobPostingCollectionDispatchPayload,
        env: CloudflareBindings,
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const service = new SupabaseJobPostingCollectionService(
    supabase,
    {} as CloudflareBindings,
    dispatch,
  );
  const callback = {
    collectionRunId: run,
    eventId: "00000000-0000-4000-8000-000000000005",
    requestId: request,
    occurredAt: now,
    schemaVersion: "1.0.0" as const,
    outcome: "manual" as const,
    response: {
      body: source,
      contentLength: source.length,
      contentType: "text/plain",
      status: 200,
    },
    extraction: null,
  };
  return { service, callback, dispatch, rpc, state };
}

describe("unified collection service", () => {
  it("dispatches AI exactly once for manual source and validates the matching callback", async () => {
    const fixture = collectionFixture();
    await fixture.service.complete(fixture.callback);
    await fixture.service.complete(fixture.callback);
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    const payload = fixture.dispatch.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      kind: "job_posting_extraction",
      jobPosting: { sourceText: source, source: "saramin" },
    });
    expect(fixture.state.row.source_text_hash).toBe(await sha256Hex(source));
    const result = await fixture.service.complete({
      ...fixture.callback,
      eventId: fixture.state.row.structure_event_id!,
      outcome: "ai_extraction",
      extraction,
    });
    expect(result.status).toBe("succeeded");
    expect(fixture.rpc).toHaveBeenLastCalledWith(
      "complete_job_posting_collection_v3",
      expect.objectContaining({
        p_status: "succeeded",
        p_structure_version: JOB_STRUCTURE_VERSION,
        p_raw_content: source,
      }),
    );
    await expect(
      fixture.service.complete({
        ...fixture.callback,
        outcome: "ai_extraction",
        extraction,
      }),
    ).rejects.toMatchObject({
      kind: "conflict",
      details: { reason: "structure_event_mismatch" },
    });
  });
  it("uses a versioned cache without another AI request", async () => {
    const fixture = collectionFixture(true);
    expect((await fixture.service.complete(fixture.callback)).status).toBe(
      "succeeded",
    );
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(fixture.rpc).toHaveBeenLastCalledWith(
      "complete_job_posting_collection_v3",
      expect.objectContaining({
        p_structure_model: JOB_STRUCTURE_MODEL,
        p_structure_prompt_version: JOB_STRUCTURE_PROMPT_VERSION,
      }),
    );
  });
  it("leaves a failed cache read replayable without claiming a never-dispatched request", async () => {
    const fixture = collectionFixture();
    fixture.state.cacheError = true;
    await expect(
      fixture.service.complete(fixture.callback),
    ).rejects.toBeInstanceOf(JobPostingCollectionServiceError);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.dispatch).not.toHaveBeenCalled();
    fixture.state.cacheError = false;
    await fixture.service.complete(fixture.callback);
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("matching dispatch reuses persisted job facts", () => {
  it("sends snapshot-bound facts without running another job structuring stage", async () => {
    const resumeId = "00000000-0000-4000-8000-000000000006";
    const portfolioId = "00000000-0000-4000-8000-000000000007";
    const row = {
      id: run,
      owner_id: owner,
      request_id: request,
      attempt_count: 1,
      job_posting_snapshot_id: snapshotId,
      job_posting_id: posting.id,
      job_posting_content_hash: "a".repeat(64),
      job_posting_text: source,
      resume_version_id: resumeId,
      portfolio_version_id: portfolioId,
      resume_profile_id: null,
      portfolio_profile_id: null,
      job_posting_profile_id: null,
      resume_content_hash: "b".repeat(64),
      portfolio_content_hash: "c".repeat(64),
      resume_text: "웹 서비스 개발 경험입니다.",
      portfolio_text: "개인 프로젝트에서 TypeScript를 사용했습니다.",
      resume_original_length: 15,
      portfolio_original_length: 30,
      resume_truncated: false,
      portfolio_truncated: false,
    } as AnalysisJobRow;
    const from = vi.fn((table: string) => {
      const value = {
        data:
          table === "job_posting_snapshots"
            ? {
                structured_facts: extraction.facts,
                structure_version: JOB_STRUCTURE_VERSION,
                structure_model: JOB_STRUCTURE_MODEL,
                structure_prompt_version: JOB_STRUCTURE_PROMPT_VERSION,
              }
            : table === "document_versions"
              ? [resumeId, portfolioId].map((id) => ({
                  id,
                  original_filename: "document.pdf",
                  file_size: 100,
                  storage_path: `${owner}/${id}.pdf`,
                }))
              : [],
        error: null,
      };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        update: () => query,
        maybeSingle: async () => value,
        then: (resolve: (input: typeof value) => unknown) =>
          Promise.resolve(value).then(resolve),
      };
      return query;
    });
    const supabase = {
      from,
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: {
              signedUrl:
                "https://example.supabase.co/storage/v1/object/sign/test.pdf",
            },
            error: null,
          }),
        }),
      },
    } as unknown as SupabaseClient<Database>;
    const payload = await buildAnalysisDispatchPayload({
      eventId: request,
      posting,
      row,
      supabase,
    });
    expect(
      payload.jobPosting.facts?.requirements[0]?.evidence[0]?.sourceVersionId,
    ).toBe(snapshotId);
    expect(payload.jobPosting.structureVersion).toBe(JOB_STRUCTURE_VERSION);
    expect(payload.kind).toBe("application_analysis");
    expect(
      from.mock.calls.filter(([table]) => table === "job_posting_snapshots"),
    ).toHaveLength(1);
  });
});

describe("one AI job structure", () => {
  it("accepts complete sources with absent optional fields and retains raw source", () => {
    const result = validateJobStructure({
      extraction,
      sourceText: source,
      collectionRunId: run,
    });
    expect(result.metadata.validThrough).toBeNull();
    expect(result.sections.benefits).toBeNull();
    expect(result.normalizedContent).toContain(source);
    expect(JSON.parse(result.contentHashInput)).toMatchObject({
      version: "job-structure-v2",
      model: "gpt-5.6-luna",
    });
  });
  it("rejects blocked/incomplete sources, invented evidence and a different source identity", () => {
    for (const value of [
      { ...extraction, sourceComplete: false },
      {
        ...extraction,
        evidence: [{ section: "자격요건", excerpt: "원문에 없는 경험" }],
      },
      {
        ...extraction,
        metadata: { ...extraction.metadata, title: "다른 공고" },
      },
      {
        ...extraction,
        facts: {
          ...extraction.facts,
          requirements: extraction.facts.requirements.map((item) => ({
            ...item,
            evidence: item.evidence.map((evidence) => ({
              ...evidence,
              sourceVersionId: "00000000-0000-4000-8000-000000000999",
            })),
          })),
        },
      },
    ])
      expect(() =>
        validateJobStructure({
          extraction: value,
          sourceText: source,
          collectionRunId: run,
        }),
      ).toThrow(JobStructureError);
  });
  it("binds immutable snapshot evidence without mutating cached facts", () => {
    const snapshot = "00000000-0000-4000-8000-000000000456";
    expect(
      bindJobFactsToSnapshot(extraction.facts, snapshot).requirements[0]
        ?.evidence[0]?.sourceVersionId,
    ).toBe(snapshot);
    expect(extraction.facts.requirements[0]?.evidence[0]?.sourceVersionId).toBe(
      run,
    );
  });
});
