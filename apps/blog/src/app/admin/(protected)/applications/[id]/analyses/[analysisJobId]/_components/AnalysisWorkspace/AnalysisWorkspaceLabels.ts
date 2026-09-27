import type { MatchStatus, Priority } from "@workspace/contracts";

export const MATCH_LABELS: Record<MatchStatus, string> = {
  matched: "충족",
  missing: "미충족",
  partial: "부분 충족",
  unknown: "확인 불가",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "높음",
  low: "낮음",
  medium: "보통",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const JOB_SECTION_LABELS = {
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
  other: "기타 본문",
} as const;
