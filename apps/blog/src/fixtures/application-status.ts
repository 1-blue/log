import type { ApplicationDetail } from "@workspace/contracts";

export function getApplicationStatusFixture(): ApplicationDetail {
  const id = "20000000-0000-4000-8000-000000000001";
  const now = "2026-10-27T00:00:00.000Z";
  return {
    id,
    attemptNumber: 1,
    status: "interested",
    appliedOn: null,
    interviewAt: null,
    note: null,
    documentsLockedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    jobPosting: {
      id,
      source: "saramin",
      externalId: "fixture",
      url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123",
      companyName: "가상 회사",
      title: "프론트엔드 개발자",
      metadataStatus: "confirmed",
      createdAt: now,
      updatedAt: now,
    },
    documents: { resume: null, portfolio: null },
    statusHistory: [],
  };
}
