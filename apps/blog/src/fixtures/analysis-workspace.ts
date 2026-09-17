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
  question3: "10000000-0000-4000-8000-000000000017",
  question4: "10000000-0000-4000-8000-000000000018",
  question5: "10000000-0000-4000-8000-000000000019",
  question6: "10000000-0000-4000-8000-000000000020",
  question7: "10000000-0000-4000-8000-000000000021",
  question8: "10000000-0000-4000-8000-000000000022",
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
            context:
              "Docker Compose로 n8n을 실행하고 로컬 Workflow 구성과 복구 절차를 확인했습니다.",
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
        answerEvidence: [
          {
            excerpt: "Docker Compose로 n8n 로컬 실행 환경을 구성했습니다.",
            section: "Career Ops 프로젝트",
            source: "portfolio",
            sourceVersionId: IDS.portfolio,
            context: "Docker Compose로 n8n 로컬 실행 환경을 구성했습니다.",
          },
        ],
        answerOutline:
          "실패 지점과 재실행 기준을 설명하고, 중복 방지와 로그 확인 절차를 함께 말합니다.",
        category: "자동화 운영",
        intent:
          "Workflow 실패를 감지하고 안전하게 복구하는 사고방식을 확인합니다.",
        priority: "high",
        question:
          "n8n Workflow가 중간 단계에서 실패했을 때 중복 실행 없이 복구하도록 설계한 방법을 설명해 주세요.",
        requirementIds: ["required-1", "required-2"],
        modelAnswer:
          "이 프로젝트에서는 Worker가 요청 ID와 멱등성을 관리하고 n8n은 비동기 작업만 수행하도록 분리했습니다. Workflow 실패 시 실행 기록과 단계별 오류를 확인한 뒤 같은 요청을 무조건 재실행하지 않고, 저장된 상태와 callback 중복 여부를 확인한 후 안전하게 재시도합니다.",
      },
      {
        answerEvidence: [
          {
            excerpt:
              "Cloudflare Worker에서 JWT 검증, 요청 검증, 멱등성과 HMAC callback을 구현했습니다.",
            section: "프로젝트 경험",
            source: "resume",
            sourceVersionId: IDS.resume,
            context:
              "Cloudflare Worker에서 JWT 검증과 요청 검증, 멱등성 및 HMAC callback을 구현했습니다.",
          },
        ],
        answerOutline:
          "Worker와 n8n의 책임을 보안, 실행 환경, 장애 격리 관점에서 비교합니다.",
        category: "Cloudflare Workers",
        intent:
          "서버리스 환경의 제약을 이해하고 API 경계를 설계했는지 확인합니다.",
        priority: "medium",
        question:
          "Cloudflare Worker를 AI 실행기가 아닌 API Gateway로 분리한 이유는 무엇인가요?",
        requirementIds: ["required-2"],
        modelAnswer:
          "외부 요청의 인증과 입력 검증은 짧고 예측 가능한 Worker에 맡기고, 시간이 오래 걸리는 AI 분석은 n8n의 비동기 Workflow로 분리했습니다. 이렇게 하면 공개 API 경계를 단순하게 유지하고, AI 지연이나 실패가 관리자 요청 처리와 인증 경계에 직접 영향을 주지 않습니다.",
      },
      {
        answerEvidence: [],
        answerOutline:
          "실제 공고와 자료에서 확인한 사실과 아직 확인하지 못한 부분을 구분합니다.",
        category: "문제 해결",
        intent: "문제를 발견하고 개선한 과정을 확인합니다.",
        modelAnswer: null,
        priority: "medium",
        question:
          "최근 직접 발견한 문제를 자동화나 구조 개선으로 해결한 경험을 설명해 주세요.",
        requirementIds: ["preferred-2"],
      },
      {
        answerEvidence: [],
        answerOutline:
          "장애를 탐지한 신호, 영향 범위, 복구 순서와 재발 방지를 나눠 설명합니다.",
        category: "운영",
        intent: "장애 대응과 운영 지표에 대한 이해를 확인합니다.",
        modelAnswer: null,
        priority: "high",
        question:
          "서비스 장애가 발생했을 때 어떤 순서로 원인을 좁히고 복구하시겠어요?",
        requirementIds: ["required-1"],
      },
      {
        answerEvidence: [],
        answerOutline:
          "데이터 보호, 인증, 권한, 입력 검증을 각각 어떤 경계에서 처리했는지 정리합니다.",
        category: "보안 설계",
        intent: "안전한 API 설계 원칙을 확인합니다.",
        modelAnswer: null,
        priority: "high",
        question:
          "개인정보를 다루는 관리자 도구에서 가장 먼저 적용할 보안 원칙은 무엇인가요?",
        requirementIds: ["required-2"],
      },
      {
        answerEvidence: [],
        answerOutline:
          "서버리스와 컨테이너의 실행 시간, 상태 관리, 배포 방식 차이를 비교합니다.",
        category: "인프라 선택",
        intent: "기술 선택의 기준과 트레이드오프를 확인합니다.",
        modelAnswer: null,
        priority: "medium",
        question:
          "이 프로젝트에서 Worker와 Docker 기반 서비스를 함께 사용한 이유를 설명해 주세요.",
        requirementIds: ["required-2"],
      },
      {
        answerEvidence: [],
        answerOutline:
          "배포 자동화의 현재 수준을 과장하지 않고, 다음에 보완할 구체적인 단계를 말합니다.",
        category: "성장과 보완",
        intent: "부족한 역량을 파악하고 학습 계획을 세우는 방식을 확인합니다.",
        modelAnswer: null,
        priority: "low",
        question:
          "현재 경험에서 가장 보완하고 싶은 인프라 역량과 그 이유는 무엇인가요?",
        requirementIds: ["preferred-1"],
      },
      {
        answerEvidence: [],
        answerOutline:
          "지원 회사의 문제와 내 경험이 만나는 지점을 한 문장으로 먼저 제시합니다.",
        category: "지원동기",
        intent: "역할과 개인 동기의 연결을 확인합니다.",
        modelAnswer: null,
        priority: "high",
        question:
          "왜 이 역할과 회사에 지원했으며, 입사 후 어떤 문제를 해결하고 싶나요?",
        requirementIds: ["required-1", "required-2"],
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
            context: "Docker Compose로 n8n 로컬 실행 환경을 구성했습니다.",
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
            context:
              "Cloudflare Worker에서 JWT 검증과 요청 검증, 멱등성 및 HMAC callback을 구현했습니다.",
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
    applicationStrategy: {
      motivationDraft:
        "반복되는 취업 준비 업무를 실제 서비스로 자동화하며 운영 가능한 API 경계와 Workflow를 구현했습니다.",
      keyMessages: [
        "실제 개인 문제를 자동화 서비스로 전환한 경험",
        "Worker와 n8n의 책임을 분리한 설계",
      ],
      resumeFocus: "API Gateway 인증·멱등성·오류 처리 경험을 강조합니다.",
      portfolioFocus:
        "실제 화면과 비동기 분석 Workflow의 운영 흐름을 보여줍니다.",
      warnings: [],
    },
    warnings: [
      "개인 프로젝트이므로 대규모 조직의 인프라 운영 경험과 동일하게 해석하면 안 됩니다.",
    ],
  },
  fitScore: 53,
  job: {
    companyName: "가상 디자인 플랫폼",
    bodySections: {
      companyIntroduction: "창작과 협업을 돕는 가상의 디자인 플랫폼입니다.",
      positionIntroduction: "제품 개발과 인프라 자동화를 연결하는 역할입니다.",
      expectations: "반복 업무를 발견하고 안정적인 자동화로 개선합니다.",
      mainResponsibilities: "API Gateway와 n8n Workflow를 설계하고 운영합니다.",
      requirements: "서버리스 API와 Docker 기반 운영 경험이 필요합니다.",
      preferred: "IaC와 대규모 서비스 운영 경험을 우대합니다.",
      employmentConditions: null,
      process: null,
      benefits: null,
      technologies: "Cloudflare Workers, n8n, Docker",
      traits: "문제를 발견하고 끝까지 개선하는 태도",
      deadline: null,
      location: null,
      other: null,
    },
    requirements: [
      {
        evidence: [
          {
            excerpt: "업무 자동화 Workflow를 구축하고 안정적으로 운영한 경험",
            section: "자격요건",
            source: "job_posting",
            sourceVersionId: IDS.snapshot,
            context:
              "업무 자동화 Workflow를 구축하고 안정적으로 운영한 경험을 요구합니다.",
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
            context: "서버리스 환경에서 안전한 API를 설계한 경험을 요구합니다.",
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
            context: "Infrastructure as Code 도구 사용 경험을 우대합니다.",
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
            context: "대규모 트래픽 서비스 운영 경험을 우대합니다.",
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
            context:
              "주요 업무에서 n8n 기반 자동화 Workflow를 설계하고 운영합니다.",
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
            context: "기술 스택으로 Cloudflare Workers를 활용합니다.",
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
            context: "자격요건에서 Docker 운영 경험을 요구합니다.",
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
            context:
              "인재상으로 실제 문제를 발견하고 끝까지 개선하는 태도를 제시합니다.",
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
  model: "fixture/gpt-5.6-luna",
  outputTokens: 1_120,
  promptVersion: "job-facts-v1",
  responseId: null,
  step: "job_facts" as const,
};

const FIXTURE_QUESTION_IDS = [
  IDS.question1,
  IDS.question2,
  IDS.question3,
  IDS.question4,
  IDS.question5,
  IDS.question6,
  IDS.question7,
  IDS.question8,
] as const;

function createFixtureQuestions(): AnalysisWorkspace["questions"] {
  return result.comparison.interviewQuestions.map((question, index) => ({
    analysisJobId: IDS.analysis,
    answerEvidence: question.answerEvidence,
    answerOutline: question.answerOutline,
    answerRevisionCount: index === 0 ? 1 : 0,
    category: question.category,
    createdAt: NOW,
    currentAnswer:
      index === 0
        ? {
            answer:
              "Webhook 이벤트 ID를 유일키로 저장하고 같은 이벤트가 다시 오면 기존 결과를 반환했습니다. 실패 단계는 retryable 여부로 분류했습니다.",
            createdAt: NOW,
            id: IDS.answer,
            questionId: FIXTURE_QUESTION_IDS[index],
            revision: 1,
          }
        : null,
    id: FIXTURE_QUESTION_IDS[index],
    intent: question.intent,
    modelAnswer: question.modelAnswer,
    priority: question.priority,
    question: question.question,
    requirementIds: question.requirementIds,
    sourceIndex: index,
  }));
}

const base: AnalysisWorkspace = {
  application: {
    attemptNumber: 1,
    companyName: "가상 디자인 플랫폼",
    id: IDS.application,
    interviewAt: null,
    status: "preparing",
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
  questions: createFixtureQuestions(),
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
        id:
          index === 0
            ? IDS.answer
            : `10000000-0000-4000-8000-${String(index + 16).padStart(12, "0")}`,
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
