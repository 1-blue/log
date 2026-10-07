import type { DocumentVersion } from "@workspace/contracts";
const messages: Record<string, string> = {
  PDF_PARSE_FAILED:
    "PDF를 읽지 못했습니다. 파일 손상이나 암호 설정을 확인해 주세요.",
  PDF_TEXT_EMPTY: "PDF에 읽을 수 있는 텍스트가 없습니다.",
  PDF_TEXT_TOO_LARGE: "추출 결과가 허용된 길이를 초과했습니다.",
  EXTRACTION_DISPATCH_FAILED:
    "추출 작업을 전달하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  OCR_PAGE_LIMIT_EXCEEDED: "자동 OCR은 30페이지 이하 문서만 지원합니다.",
  OCR_PAGE_COUNT_UNKNOWN:
    "페이지 수를 확인하지 못해 자동 OCR을 시작하지 않았습니다.",
  OCR_TEXT_EMPTY: "OCR에서도 텍스트를 읽지 못했습니다.",
  OCR_INCOMPLETE: "OCR 결과가 불완전해 분석용으로 저장하지 않았습니다.",
  OCR_TIMEOUT: "OCR 처리 시간이 초과되었습니다.",
  OCR_RATE_LIMITED: "OCR 호출 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
  OCR_BILLING_LIMIT: "OpenAI 결제 또는 사용 한도를 확인해 주세요.",
  OCR_UNAVAILABLE: "OCR 서비스를 일시적으로 사용할 수 없습니다.",
  OCR_FAILED: "자동 OCR에 실패했습니다.",
};
export const extractionFailureMessage = (
  code: DocumentVersion["extractionError"],
) => messages[code ?? ""] ?? "텍스트 추출에 실패했습니다.";
