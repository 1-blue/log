import {
  type JobPostingBodySections,
  JobPostingBodySectionsSchema,
} from "@workspace/contracts";

export function decodeEntities(value: string): string {
  const decodeCodePoint = (entity: string, codePoint: number) =>
    Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;

  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, token: string) => {
        const lower = token.toLowerCase();
        if (lower.startsWith("#x")) {
          return decodeCodePoint(entity, Number.parseInt(lower.slice(2), 16));
        }
        if (lower.startsWith("#")) {
          return decodeCodePoint(entity, Number.parseInt(lower.slice(1), 10));
        }
        return (
          { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }[
            lower
          ] ?? entity
        );
      },
    );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function normalizeJobPostingText(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|h[1-6]|section)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  return (
    decodeEntities(withBreaks)
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      // HTML 본문에 섞인 비출력 ASCII 제어 문자만 제거한다.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const WANTED_NON_POSTING_MARKERS = [
  /^(?:더 많은 포지션을 찾아 볼까요\??|탐색하기)$/i,
  /^(?:지원할 만한 매력적인 포지션들이 기다리고 있어요\.?|포지션 탐색)$/i,
  /^(?:©\s*저작권자|본 채용정보는|원티드랩의 동의 없이)/i,
  /^(?:관련 채용공고|추천 포지션|채용공고 더보기)$/i,
  /^(?:원티드|wanted)\s*(?:앱|서비스)?\s*(?:다운로드|탐색)?$/i,
];

export function removeWantedNonPostingContent(value: string): string {
  const lines = value.split("\n");
  const cutoff = lines.findIndex((line) =>
    WANTED_NON_POSTING_MARKERS.some((marker) => marker.test(line.trim())),
  );
  return (cutoff >= 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}

function cleanSectionValue(key: SectionKey, value: string): string | null {
  let cleaned = removeWantedNonPostingContent(value).trim();
  if (!cleaned) return null;
  if (key === "technologies") {
    cleaned = cleaned
      .split("\n")
      .filter((line) => !/^(?:풀|툴|태그)(?:\s*[|·])?$/i.test(line))
      .join("\n")
      .trim();
    if (!cleaned) return null;
  }
  return cleaned;
}

type SectionKey = keyof JobPostingBodySections;

const SECTION_HEADINGS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: "companyIntroduction", pattern: /^회사\s*소개$/i },
  { key: "positionIntroduction", pattern: /^(?:직무|포지션)\s*소개$/i },
  { key: "expectations", pattern: /^기대\s*모습$/i },
  {
    key: "mainResponsibilities",
    pattern: /^(?:주요\s*업무|담당\s*업무|responsibilities)$/i,
  },
  { key: "requirements", pattern: /^(?:자격\s*요건|자격요건|requirements)$/i },
  { key: "preferred", pattern: /^(?:우대\s*사항|우대사항|preferred)$/i },
  {
    key: "employmentConditions",
    pattern: /^(?:고용\s*조건|근무\s*조건|employment\s*conditions?)$/i,
  },
  {
    key: "process",
    pattern: /^(?:채용\s*절차|전형\s*절차|진행\s*절차|process)$/i,
  },
  { key: "benefits", pattern: /^(?:복리\s*후생|복지|benefits?)$/i },
  {
    key: "technologies",
    pattern: /^(?:기술\s*스택|기술스택|사용\s*기술|technologies?)$/i,
  },
  { key: "traits", pattern: /^(?:인재상|traits?)$/i },
  { key: "deadline", pattern: /^(?:마감일|마감|deadline)$/i },
  { key: "location", pattern: /^(?:근무\s*지역|근무지|location)$/i },
];

const SECTION_MAX_LENGTH: Record<SectionKey, number> = {
  companyIntroduction: 20_000,
  positionIntroduction: 20_000,
  expectations: 20_000,
  mainResponsibilities: 30_000,
  requirements: 30_000,
  preferred: 30_000,
  employmentConditions: 10_000,
  process: 10_000,
  benefits: 10_000,
  technologies: 10_000,
  traits: 10_000,
  deadline: 2_000,
  location: 2_000,
  other: 20_000,
};

function sectionHeading(line: string): { key: SectionKey } | null {
  const candidate = line
    .replace(/^[\s\-•·▸▶|]+|[\s:：]+$/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();
  return (
    SECTION_HEADINGS.find(({ pattern }) => pattern.test(candidate)) ?? null
  );
}

function sectionLine(
  line: string,
): { key: SectionKey; content: string } | null {
  const exact = sectionHeading(line);
  if (exact) return { ...exact, content: "" };

  const candidate = line.replace(/[\t ]+/g, " ").trim();
  const separator = candidate.match(/^(.+?)\s*[:：]\s*(.+)$/);
  if (separator?.[1] && separator[2]) {
    const heading = sectionHeading(separator[1]);
    if (heading) return { ...heading, content: separator[2].trim() };
  }
  return null;
}

export function extractJobPostingSections(
  description: string,
): JobPostingBodySections {
  const sections: Record<SectionKey, string | null> = {
    companyIntroduction: null,
    positionIntroduction: null,
    expectations: null,
    mainResponsibilities: null,
    requirements: null,
    preferred: null,
    employmentConditions: null,
    process: null,
    benefits: null,
    technologies: null,
    traits: null,
    deadline: null,
    location: null,
    other: null,
  };
  let current: SectionKey | null = null;
  const other: string[] = [];
  const content = Object.fromEntries(
    Object.keys(sections).map((key) => [key, []]),
  ) as unknown as Record<SectionKey, string[]>;

  for (const rawLine of description.split("\n")) {
    const line = rawLine.trim();
    const heading = sectionLine(line);
    if (heading) {
      current = heading.key;
      if (heading.content) content[current].push(heading.content);
      continue;
    }
    if (!line) continue;
    if (current) content[current].push(line);
    else other.push(line);
  }

  for (const { key } of SECTION_HEADINGS) {
    const value = cleanSectionValue(key, content[key].join("\n"));
    sections[key] = value ? value.slice(0, SECTION_MAX_LENGTH[key]) : null;
  }
  const otherText = cleanSectionValue("other", other.join("\n"));
  sections.other = otherText
    ? otherText.slice(0, SECTION_MAX_LENGTH.other)
    : null;
  return JobPostingBodySectionsSchema.parse(sections);
}
