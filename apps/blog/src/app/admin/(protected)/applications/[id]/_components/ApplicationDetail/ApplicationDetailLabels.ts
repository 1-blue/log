import type {
  AnalysisJobResponse,
  JobPostingCollectionErrorCode,
} from "@workspace/contracts";

export const COLLECTION_ERROR_LABELS: Record<
  JobPostingCollectionErrorCode,
  string
> = {
  ACCESS_BLOCKED: "Wanted가 자동 접근을 차단했습니다.",
  CONTENT_TOO_LARGE: "공고 원문이 허용된 크기를 초과했습니다.",
  DISPATCH_FAILED: "수집 Workflow에 요청을 전달하지 못했습니다.",
  INVALID_CONTENT_TYPE: "Wanted가 HTML이 아닌 응답을 반환했습니다.",
  INVALID_JOB_POSTING: "유효한 채용공고 내용을 확인하지 못했습니다.",
  JOB_EXPIRED: "삭제되었거나 만료된 공고입니다.",
  NETWORK_ERROR: "Wanted 연결 중 네트워크 오류가 발생했습니다.",
  PARSER_STRUCTURE_CHANGED:
    "Wanted 공고 구조가 변경되어 자동으로 읽지 못했습니다.",
  RATE_LIMITED: "Wanted 요청 제한에 도달했습니다.",
  REDIRECT_NOT_ALLOWED: "공고가 다른 주소로 이동되었습니다.",
  TIMEOUT: "Wanted 응답 시간이 초과되었습니다.",
  UPSTREAM_ERROR: "Wanted 서버에서 오류를 반환했습니다.",
  URL_MISMATCH: "응답 공고와 등록한 URL이 일치하지 않습니다.",
};

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
