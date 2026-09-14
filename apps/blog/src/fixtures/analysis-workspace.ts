import type { AnalysisWorkspace } from "@workspace/contracts";

export const ANALYSIS_PREVIEW_SCENARIOS = [
  "mixed",
  "complete",
  "empty",
  "long",
  "history",
] as const;

export type AnalysisPreviewScenario =
  (typeof ANALYSIS_PREVIEW_SCENARIOS)[number];

const IDS = {
  analysis: "10000000-0000-4000-8000-000000000001",
  answer: "10000000-0000-4000-8000-000000000002",
  application: "10000000-0000-4000-8000-000000000003",
  checklist1: "10000000-0000-4000-8000-000000000004",
  checklist2: "10000000-0000-4000-8000-000000000005",
  checklist3: "10000000-0000-4000-8000-000000000006",
  history: "10000000-0000-4000-8000-000000000007",
  note: "10000000-0000-4000-8000-000000000008",
  portfolio: "10000000-0000-4000-8000-000000000009",
  posting: "10000000-0000-4000-8000-000000000010",
  question1: "10000000-0000-4000-8000-000000000011",
  question2: "10000000-0000-4000-8000-000000000012",
  request: "10000000-0000-4000-8000-000000000013",
  resume: "10000000-0000-4000-8000-000000000014",
  snapshot: "10000000-0000-4000-8000-000000000015",
} as const;

const NOW = "2026-09-14T09:00:00.000Z";
const EARLIER = "2026-09-07T09:00:00.000Z";

const sources: AnalysisWorkspace["sources"] = {
  jobPostingSnapshot: {
    contentHash: "a".repeat(64),
    fetchedAt: "2026-09-14T08:57:00.000Z",
    id: IDS.snapshot,
    source: "wanted_json_ld",
  },
  portfolio: {
    archivedAt: null,
    contentHash: "b".repeat(64),
    id: IDS.portfolio,
    label: "AX 포트폴리오 2026-09",
  },
  resume: {
    archivedAt: null,
    contentHash: "c".repeat(64),
    id: IDS.resume,
    label: "인프라 지원 이력서 v3",
  },
};

const result: NonNullable<AnalysisWorkspace["job"]["result"]> = {
  comparison: {
    gaps: [
      {
        actions: [
          "n8n 장애 상황과 수동 복구 절차를 한 장으로 정리한다.",
          "실패율과 평균 처리 시간을 측정할 지표를 정의한다.",
        ],
        description:
          "자동화 구현 경험은 확인되지만 장기 운영 중 장애를 탐지하고 복구한 근거가 부족합니다.",
        evidence: [
          {
            excerpt: "Docker Compose로 n8n 로컬 실행 환경을 구성했습니다.",
            section: "Career Ops 프로젝트",
            source: "portfolio",
            sourceVersionId: IDS.portfolio,
          },
        ],
        priority: "high",
        requirementIds: ["required-1"],
        title: "자동화 Workflow 운영 경험",
      },
      {
        actions: ["Terraform 또는 Wrangler 기반 배포 자동화 사례를 추가한다."],
        description:
          "Worker 구현 경험은 있으나 IaC로 인프라 변경을 관리한 사례는 확인되지 않습니다.",
        evidence: [],
        priority: "medium",
        requirementIds: ["preferred-1"],
        title: "Infrastructure as Code 경험",
      },
    ],
    interviewQuestions: [
      {
        category: "자동화 운영",
        intent:
          "Workflow 실패를 감지하고 안전하게 복구하는 사고방식을 확인합니다.",
        priority: "high",
        question:
          "n8n Workflow가 중간 단계에서 실패했을 때 중복 실행 없이 복구하도록 설계한 방법을 설명해 주세요.",
        requirementIds: ["required-1", "required-2"],
      },
      {
        category: "Cloudflare Workers",
        intent:
          "서버리스 환경의 제약을 이해하고 API 경계를 설계했는지 확인합니다.",
        priority: "medium",
        question:
          "Cloudflare Worker를 AI 실행기가 아닌 API Gateway로 분리한 이유는 무엇인가요?",
        requirementIds: ["required-2"],
      },
    ],
    matches: [
      {
        profileEvidence: [
          {
            excerpt: "Docker Compose로 n8n 로컬 실행 환경을 구성했습니다.",
            section: "Career Ops 프로젝트",
            source: "portfolio",
            sourceVersionId: IDS.portfolio,
          },
        ],
        rationale:
          "자동화 환경 구성은 확인되지만 운영 장애 대응과 관측 지표 근거가 부족합니다.",
        requirementId: "required-1",
        status: "partial",
      },
      {
        profileEvidence: [
          {
            excerpt:
              "Cloudflare Worker에서 JWT 검증, 요청 검증, 멱등성과 HMAC callback을 구현했습니다.",
            section: "프로젝트 경험",
            source: "resume",
            sourceVersionId: IDS.resume,
          },
        ],
        rationale: "API Gateway의 인증과 비동기 요청 경계를 직접 구현했습니다.",
        requirementId: "required-2",
        status: "matched",
      },
      {
        profileEvidence: [],
        rationale: "Infrastructure as Code 도구 사용 근거를 찾지 못했습니다.",
        requirementId: "preferred-1",
        status: "missing",
      },
      {
        profileEvidence: [],
        rationale:
          "대규모 트래픽 환경의 운영 범위를 자료에서 확인할 수 없습니다.",
        requirementId: "preferred-2",
        status: "unknown",
      },
    ],
    summary:
      "API Gateway와 자동화 Workflow 개발 경험은 역할과 직접 연결됩니다. 다만 장기 운영 장애 대응, IaC, 처리량 지표를 실제 사용 과정에서 보완해야 합니다.",
    warnings: [
      "개인 프로젝트이므로 대규모 조직의 인프라 운영 경험과 동일하게 해석하면 안 됩니다.",
    ],
  },
  fitScore: 53,
  job: {
    companyName: "가상 디자인 플랫폼",
    requirements: [
      {
        evidence: [
          {
            excerpt: "업무 자동화 Workflow를 구축하고 안정적으로 운영한 경험",
            section: "자격요건",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        id: "required-1",
        kind: "required",
        text: "업무 자동화 Workflow를 구축하고 안정적으로 운영한 경험",
      },
      {
        evidence: [
          {
            excerpt: "서버리스 환경에서 안전한 API를 설계한 경험",
            section: "자격요건",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        id: "required-2",
        kind: "required",
        text: "서버리스 환경에서 안전한 API를 설계한 경험",
      },
      {
        evidence: [
          {
            excerpt: "Infrastructure as Code 도구 사용 경험",
            section: "우대사항",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        id: "preferred-1",
        kind: "preferred",
        text: "Infrastructure as Code 도구 사용 경험",
      },
      {
        evidence: [
          {
            excerpt: "대규모 트래픽 서비스 운영 경험",
            section: "우대사항",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        id: "preferred-2",
        kind: "preferred",
        text: "대규모 트래픽 서비스 운영 경험",
      },
    ],
    summary:
      "제품 조직의 반복 업무를 자동화하고 서버리스 인프라와 애플리케이션을 안전하게 연결하는 역할입니다.",
    technologies: [
      {
        category: "Automation",
        evidence: [
          {
            excerpt: "n8n 기반 자동화 Workflow",
            section: "주요업무",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        name: "n8n",
      },
      {
        category: "Edge",
        evidence: [
          {
            excerpt: "Cloudflare Workers",
            section: "기술스택",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        name: "Cloudflare Workers",
      },
      {
        category: "Container",
        evidence: [
          {
            excerpt: "Docker 운영 경험",
            section: "자격요건",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        name: "Docker",
      },
    ],
    title: "AX Engineer - Infra",
    traits: [
      {
        evidence: [
          {
            excerpt: "실제 문제를 발견하고 끝까지 개선하는 분",
            section: "인재상",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
          },
        ],
        text: "실제 문제를 발견하고 끝까지 개선하는 태도",
      },
    ],
    warnings: [],
  },
};

const execution = {
  attemptCount: 1,
  inputTokens: 4_850,
  latencyMs: 3_240,
  model: "fixture-model-2026-09",
  outputTokens: 1_120,
  promptVersion: "job-facts-v1",
  responseId: null,
  step: "job_facts" as const,
};

const base: AnalysisWorkspace = {
  application: {
    attemptNumber: 1,
    companyName: "가상 디자인 플랫폼",
    id: IDS.application,
    title: "AX Engineer - Infra",
  },
  checklist: [
    {
      analysisJobId: IDS.analysis,
      archivedAt: null,
      completedAt: NOW,
      content: "n8n 장애 상황과 수동 복구 절차를 한 장으로 정리한다.",
      createdAt: NOW,
      id: IDS.checklist1,
      position: 0,
      priority: "high",
      source: "gap_action",
      sourceKey: "gap:0:action:0",
      updatedAt: NOW,
    },
    {
      analysisJobId: IDS.analysis,
      archivedAt: null,
      completedAt: null,
      content: "실패율과 평균 처리 시간을 측정할 지표를 정의한다.",
      createdAt: NOW,
      id: IDS.checklist2,
      position: 1,
      priority: "high",
      source: "gap_action",
      sourceKey: "gap:0:action:1",
      updatedAt: NOW,
    },
    {
      analysisJobId: IDS.analysis,
      archivedAt: null,
      completedAt: null,
      content: "30초 자기소개에 프로젝트 문제와 성과를 포함한다.",
      createdAt: NOW,
      id: IDS.checklist3,
      position: 2,
      priority: "medium",
      source: "custom",
      sourceKey: null,
      updatedAt: NOW,
    },
  ],
  comparison: null,
  history: [],
  interviewNotes: [
    {
      analysisJobId: IDS.analysis,
      applicationId: IDS.application,
      archivedAt: null,
      content: "질문의 전제가 모호할 때 먼저 상황을 확인한 점은 유지한다.",
      createdAt: NOW,
      followUpActions: "운영 지표를 수치로 정리하고 답변을 다시 녹음한다.",
      id: IDS.note,
      improvements: "답변이 길어져 핵심 결론이 늦게 나왔다.",
      interviewedAt: "2026-09-13T05:00:00.000Z",
      questionsAsked: "Workflow 중복 실행 방지와 장애 복구 방법",
      roundLabel: "모의 실무 면접",
      updatedAt: NOW,
      wentWell: "Request ID와 멱등성 키의 역할을 실제 코드와 연결했다.",
    },
  ],
  job: {
    applicationId: IDS.application,
    attemptCount: 1,
    createdAt: "2026-09-14T08:58:00.000Z",
    finishedAt: NOW,
    id: IDS.analysis,
    jobPostingId: IDS.posting,
    jobPostingSnapshotId: IDS.snapshot,
    lastError: null,
    lastHeartbeatAt: NOW,
    portfolioVersionId: IDS.portfolio,
    requestId: IDS.request,
    result,
    resumeVersionId: IDS.resume,
    retryAt: null,
    stage: "saving",
    startedAt: "2026-09-14T08:58:03.000Z",
    status: "succeeded",
    updatedAt: NOW,
  },
  questions: [
    {
      analysisJobId: IDS.analysis,
      answerRevisionCount: 1,
      category: result.comparison.interviewQuestions[0]!.category,
      createdAt: NOW,
      currentAnswer: {
        answer:
          "Webhook 이벤트 ID를 유일키로 저장하고 같은 이벤트가 다시 오면 기존 결과를 반환했습니다. 실패 단계는 retryable 여부로 분류했습니다.",
        createdAt: NOW,
        id: IDS.answer,
        questionId: IDS.question1,
        revision: 1,
      },
      id: IDS.question1,
      intent: result.comparison.interviewQuestions[0]!.intent,
      priority: result.comparison.interviewQuestions[0]!.priority,
      question: result.comparison.interviewQuestions[0]!.question,
      requirementIds: result.comparison.interviewQuestions[0]!.requirementIds,
      sourceIndex: 0,
    },
    {
      analysisJobId: IDS.analysis,
      answerRevisionCount: 0,
      category: result.comparison.interviewQuestions[1]!.category,
      createdAt: NOW,
      currentAnswer: null,
      id: IDS.question2,
      intent: result.comparison.interviewQuestions[1]!.intent,
      priority: result.comparison.interviewQuestions[1]!.priority,
      question: result.comparison.interviewQuestions[1]!.question,
      requirementIds: result.comparison.interviewQuestions[1]!.requirementIds,
      sourceIndex: 1,
    },
  ],
  resultMetadata: {
    createdAt: NOW,
    executions: [
      execution,
      {
        ...execution,
        inputTokens: 6_240,
        latencyMs: 4_180,
        outputTokens: 1_480,
        promptVersion: "profile-comparison-v1",
        step: "profile_comparison",
      },
    ],
    schemaVersion: "1.0.0",
  },
  review: {
    overallNote:
      "AI가 부분 충족으로 본 운영 경험은 로컬 장애 복구 테스트 근거를 추가해 직접 보정했습니다.",
    requirements: [
      {
        note: "stale workflow 탐지와 callback 재시도 테스트를 근거로 사용한다.",
        overrideStatus: "matched",
        requirementId: "required-1",
      },
      {
        note: "Wrangler 설정은 있으나 IaC 경험으로 과장하지 않는다.",
        overrideStatus: "partial",
        requirementId: "preferred-1",
      },
    ],
    updatedAt: NOW,
  },
  reviewedFitScore: 78,
  sources,
};

const previous: AnalysisWorkspace["history"][number] = {
  analysisJobId: IDS.history,
  completedAt: EARLIER,
  createdAt: "2026-09-07T08:57:00.000Z",
  executions: [
    {
      ...execution,
      model: "fixture-model-previous",
      promptVersion: "job-facts-v0",
    },
  ],
  fitScore: 45,
  gapCount: 3,
  matchCounts: { matched: 1, missing: 2, partial: 1, unknown: 0 },
  questionCount: 3,
  sources: {
    ...sources,
    resume: {
      ...sources.resume,
      contentHash: "d".repeat(64),
      label: "인프라 지원 이력서 v2",
    },
  },
};

export function getAnalysisWorkspaceFixture(
  scenario: AnalysisPreviewScenario = "mixed",
): AnalysisWorkspace {
  const fixture = structuredClone(base);
  fixture.history = [
    {
      analysisJobId: fixture.job.id,
      completedAt: fixture.job.finishedAt!,
      createdAt: fixture.job.createdAt,
      executions: fixture.resultMetadata!.executions,
      fitScore: fixture.job.result!.fitScore,
      gapCount: fixture.job.result!.comparison.gaps.length,
      matchCounts: { matched: 1, missing: 1, partial: 1, unknown: 1 },
      questionCount: fixture.questions.length,
      sources: fixture.sources,
    },
    previous,
  ];

  if (scenario === "complete") {
    fixture.checklist = fixture.checklist.map((item) => ({
      ...item,
      completedAt: NOW,
    }));
    fixture.questions = fixture.questions.map((question, index) => ({
      ...question,
      answerRevisionCount: 2,
      currentAnswer: {
        answer: `완성된 STAR 답변 ${index + 1}: 상황, 행동, 결과와 배운 점을 간결하게 설명합니다.`,
        createdAt: NOW,
        id: index === 0 ? IDS.answer : "10000000-0000-4000-8000-000000000016",
        questionId: question.id,
        revision: 2,
      },
    }));
  }
  if (scenario === "empty") {
    fixture.review = { overallNote: null, requirements: [], updatedAt: null };
    fixture.reviewedFitScore = fixture.job.result!.fitScore;
    fixture.questions = fixture.questions.map((question) => ({
      ...question,
      answerRevisionCount: 0,
      currentAnswer: null,
    }));
    fixture.checklist = fixture.checklist
      .filter((item) => item.source === "gap_action")
      .map((item) => ({ ...item, completedAt: null }));
    fixture.interviewNotes = [];
  }
  if (scenario === "long") {
    const longSentence =
      "긴 분석 결과에서도 줄바꿈과 카드 너비가 무너지지 않는지 확인하기 위한 설명입니다. ";
    fixture.job.result!.comparison.summary = longSentence.repeat(30);
    fixture.job.result!.comparison.gaps[0]!.description =
      longSentence.repeat(20);
    fixture.questions[0]!.question = longSentence.repeat(12);
  }
  if (scenario === "history") fixture.comparison = previous;
  return fixture;
}
