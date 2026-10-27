import type { JobPostingCollectionErrorCode } from "./job-postings";

// Safe, shared explanations: never include provider output, source text or keys.
export const JOB_POSTING_COLLECTION_ERROR_MESSAGES: Record<
  JobPostingCollectionErrorCode,
  string
> = {
  ACCESS_BLOCKED:
    "채용 사이트가 접근을 차단했습니다. 로그인·보안 안내가 아닌 실제 공고 원문을 직접 입력해 주세요.",
  AUTOMATIC_COLLECTION_UNSUPPORTED:
    "자동 수집을 지원하지 않는 링크입니다. 해당 공고의 원문을 직접 입력해 주세요.",
  AI_STRUCTURING_FAILED:
    "AI가 공고 정보를 구조화하지 못했습니다. 잠시 후 다시 시도하거나 입력 원문을 확인해 주세요.",
  SOURCE_TEXT_EMPTY:
    "공고 원문이 비어 있습니다. 공고 텍스트를 입력해 주세요. 이미지나 iframe의 글자는 일반 텍스트 복사에서 누락될 수 있습니다.",
  SOURCE_NOT_JOB_POSTING:
    "입력에서 대상 공고의 채용 정보를 확인하지 못했습니다. 로그인·차단 안내나 추천 공고 목록 대신 실제 공고 내용을 입력해 주세요.",
  AI_RESPONSE_INVALID:
    "AI 응답이 지정된 형식에 맞지 않거나 완료되지 않았습니다. 입력 누락과는 다른 처리 오류이므로 다시 요청해 주세요.",
  AI_EVIDENCE_MISMATCH:
    "AI가 원문에 없는 문장을 근거로 반환해 결과를 저장하지 않았습니다. 원문을 변경할 필요 없이 다시 요청해 주세요.",
  AI_SOURCE_MISMATCH:
    "AI 결과의 출처가 현재 공고 요청과 일치하지 않습니다. 잘못된 결과를 저장하지 않았으니 다시 요청해 주세요.",
  AI_METADATA_MISMATCH:
    "AI 응답 안의 회사명·공고명이 서로 일치하지 않아 저장하지 않았습니다. 다시 요청해 주세요.",
  AI_TIMEOUT:
    "AI 공고 구조화 요청 시간이 초과됐습니다. 잠시 후 다시 요청해 주세요.",
  AI_RATE_LIMITED:
    "AI 요청 한도에 도달했습니다. 잠시 기다린 뒤 다시 요청해 주세요.",
  AI_AUTHENTICATION_FAILED:
    "AI 인증 또는 권한 설정을 확인해야 합니다. 관리자에게 OpenAI Credential 점검을 요청해 주세요.",
  AI_BILLING_LIMIT:
    "AI 결제·사용 한도 문제로 처리하지 못했습니다. 충전 잔액과 프로젝트 한도를 확인해 주세요.",
  AI_SERVICE_UNAVAILABLE:
    "AI 서비스 연결 또는 서버 오류로 처리하지 못했습니다. 잠시 후 다시 요청해 주세요.",
  CONTENT_TOO_LARGE:
    "공고 원문이 허용된 크기를 초과했습니다. 광고·추천 목록 등을 제외한 해당 공고 본문만 입력해 주세요.",
  DISPATCH_FAILED:
    "수집 Workflow에 요청을 전달하지 못했습니다. 잠시 후 다시 시도하고 반복되면 n8n 연결을 확인해 주세요.",
  INVALID_CONTENT_TYPE:
    "채용 사이트가 HTML이 아닌 응답을 반환했습니다. 공고 원문을 직접 입력해 주세요.",
  INVALID_JOB_POSTING:
    "공고 내용을 확인하지 못했습니다. 주요 업무·자격요건 미기재 자체는 오류가 아닙니다. 해당 공고의 실제 원문인지 확인해 주세요.",
  JOB_EXPIRED:
    "삭제되었거나 만료된 공고입니다. 현재 접근 가능한 공고인지 확인해 주세요.",
  NETWORK_ERROR:
    "채용 사이트 연결 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도하거나 원문을 직접 입력해 주세요.",
  PARSER_STRUCTURE_CHANGED:
    "공고 내용을 자동으로 확인하지 못했습니다. 해당 공고 원문을 직접 입력해 주세요.",
  RATE_LIMITED:
    "채용 사이트 요청 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
  REDIRECT_NOT_ALLOWED:
    "공고가 다른 주소로 이동됐습니다. 최종 공고 주소를 등록하거나 원문을 직접 입력해 주세요.",
  TIMEOUT:
    "채용 사이트 응답 시간이 초과됐습니다. 잠시 후 다시 시도하거나 원문을 직접 입력해 주세요.",
  UPSTREAM_ERROR:
    "채용 사이트 서버에서 오류를 반환했습니다. 잠시 후 다시 시도하거나 원문을 직접 입력해 주세요.",
  URL_MISMATCH:
    "응답 공고와 등록한 URL이 일치하지 않습니다. 대상 공고의 주소와 원문을 확인해 주세요.",
};
