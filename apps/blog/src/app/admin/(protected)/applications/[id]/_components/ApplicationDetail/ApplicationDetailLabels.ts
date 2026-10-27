import {
  type AnalysisJobResponse,
  JOB_POSTING_COLLECTION_ERROR_MESSAGES,
} from "@workspace/contracts";

export const COLLECTION_ERROR_LABELS = JOB_POSTING_COLLECTION_ERROR_MESSAGES;

export const JOB_POSTING_SECTION_LABELS = {
  companyIntroduction: "회사 소개",
  positionIntroduction: "직무 소개",
  expectations: "기대 모습",
  mainResponsibilities: "주요 업무",
  requirements: "자격요건",
  preferred: "우대사항",
  employmentConditions: "고용조건",
  process: "채용절차",
  benefits: "복리후생",
  technologies: "기술 스택",
  traits: "인재상",
  deadline: "마감일",
  location: "근무지역",
} as const;

export const ANALYSIS_STATUS_LABELS: Record<
  AnalysisJobResponse["status"],
  string
> = {
  cancelled: "취소됨",
  failed: "분석 실패",
  needs_input: "추가 입력 필요",
  queued: "분석 대기 중",
  retrying: "분석 재시도 중",
  running: "분석 중",
  succeeded: "분석 완료",
};

export const ANALYSIS_STAGE_LABELS: Record<
  NonNullable<AnalysisJobResponse["stage"]>,
  string
> = {
  dispatching: "Workflow 전달",
  extracting: "공고 요구사항 추출",
  fetching: "원문 확인",
  generating_questions: "면접 질문 생성",
  matching: "이력서·포트폴리오 비교",
  normalizing: "원문 정리",
  notifying: "완료 알림",
  saving: "결과 저장",
};
