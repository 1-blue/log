import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const KOREA_TZ = "Asia/Seoul";

/** 프론트매터에서 사용하는 날짜 형식들 (한국 시간 기준) */
const KOREA_DATE_FORMATS = [
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DD HH:mm",
  "YYYY-MM-DD",
];

/**
 * 날짜를 한국 시간으로 파싱 후 포맷
 * - 입력값은 무조건 한국 시간 기준으로 해석
 * - "2026-03-16 18:00:00" → 3월 16일 (한국 시간 오후 6시)
 * - ISO 문자열(UTC) → 한국 시간으로 변환
 */
export const toKoreaDate = (
  dateInput: string | Date,
  format = "YYYY-MM-DD",
): string => {
  if (dateInput == null || dateInput === "") return "";

  const str =
    typeof dateInput === "string"
      ? dateInput
      : (dateInput as Date).toISOString();

  if (str.includes("T") && /Z$|[+-]\d{2}:?\d{2}$/.test(str)) {
    return dayjs.utc(str).tz(KOREA_TZ).format(format);
  }
  const parsed = dayjs(str, KOREA_DATE_FORMATS).tz(KOREA_TZ, true);
  return parsed.isValid() ? parsed.format(format) : "";
};

/**
 * 현재 시각을 한국 시간으로
 */
export const nowKorea = () => dayjs().tz(KOREA_TZ);

/**
 * 한국 시간 기준 오늘 날짜 문자열 (YYYY-MM-DD)
 */
export const todayKorea = () => nowKorea().format("YYYY-MM-DD");

/**
 * 한국 시간 포맷 (썸네일용: 2026. 3. 17)
 */
export const toKoreaLocaleDate = (dateInput: string | Date): string =>
  toKoreaDate(dateInput, "YYYY. M. D");

export { dayjs };
